const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const CSV_PATH = path.join(__dirname, '..', 'model', 'cleaned_transport_data (2).csv');
const USERS_FILE = path.join(__dirname, 'users.json');

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] !== undefined ? cols[idx] : '';
    });
    rows.push(obj);
  }
  return rows;
}

let data = [];
function loadData() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error('CSV not found at', CSV_PATH);
    return;
  }
  const txt = fs.readFileSync(CSV_PATH, 'utf8');
  data = parseCSV(txt).map(r => ({
    ...r,
    passenger_count: parseFloat(r.passenger_count) || 0,
    delay_minutes: parseFloat(r.delay_minutes) || 0,
    hour_of_day: parseInt(r.hour_of_day) || (new Date(r.scheduled_time).getHours()),
    weather: (r.weather || 'sunny').toLowerCase(),
    route_id: (r.route_id || '').toUpperCase()
  }));
  console.log('Loaded', data.length, 'rows from CSV');
}

loadData();

// Helpers
function avg(arr) { return arr.reduce((a,b)=>a+b,0)/Math.max(arr.length,1); }

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Return list of unique routes available in CSV
app.get('/api/routes', (req, res) => {
  try {
    const unique = Array.from(new Set(data.map(r => r.route_id))).sort();
    return res.json({ routes: unique });
  } catch (err) {
    return res.status(500).json({ error: 'failed to list routes' });
  }
});

const bcrypt = require('bcryptjs');

// Proxy auth endpoints to Python auth service (Flask) which manages SQLite for users
app.post('/api/auth/signup', async (req, res) => {
  try {
    const resp = await fetch('http://127.0.0.1:6000/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    const j = await resp.json();
    return res.status(resp.status).json(j);
  } catch (e) {
    return res.json({ success: false, error: 'Auth service unavailable' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const resp = await fetch('http://127.0.0.1:6000/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    const j = await resp.json();
    return res.status(resp.status).json(j);
  } catch (e) {
    return res.json({ success: false, error: 'Auth service unavailable' });
  }
});

app.post('/api/predict', (req, res) => {
  const { route_id, scheduled_time, weather, day_type, passenger_count } = req.body || {};
  const route = (route_id || '').toUpperCase();
  const w = (weather || 'sunny').toLowerCase();

  let hour = 8;
  if (scheduled_time) {
    const parts = scheduled_time.split(':');
    if (parts.length >= 1) hour = parseInt(parts[0], 10) || hour;
    else {
      const d = new Date(scheduled_time);
      if (!isNaN(d)) hour = d.getHours();
    }
  }

  // First, try the Python model server if available
  (async () => {
    try {
      const resp = await fetch('http://127.0.0.1:6000/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route_id, scheduled_time, weather, day_type, passenger_count })
      });
      if (resp.ok) {
        const j = await resp.json();
        if (!j.error) return res.json(j);
      }
    } catch (e) {
      // Python server not available — fall back to CSV averaging below
    }

    // Try progressive filters
  const buckets = [
    r => r.route_id === route && r.weather === w && r.hour_of_day === hour,
    r => r.route_id === route && r.hour_of_day === hour,
    r => r.route_id === route,
    r => r.weather === w && r.hour_of_day === hour,
    r => r.weather === w,
    () => true
  ];

  let chosen = null;
  let usedFilter = 5;
  for (let i = 0; i < buckets.length; i++) {
    const arr = data.filter(buckets[i]);
    if (arr.length >= 3) { chosen = arr; usedFilter = i; break; }
    if (!chosen && i === buckets.length -1) chosen = arr; // fallback to all
  }

  // If passenger_count provided, try to narrow to similar passenger ranges
  let passengerFiltered = chosen;
  const pc = Number(passenger_count);
  if (!isNaN(pc) && chosen && chosen.length > 0) {
    // allow +/-20% or +/-10 passengers, whichever is larger
    const tol = Math.max(Math.round(pc * 0.2), 10);
    const arr = chosen.filter(r => {
      const p = Number(r.passenger_count) || 0;
      return Math.abs(p - pc) <= tol;
    });
    if (arr.length >= 3) {
      passengerFiltered = arr;
      usedFilter = Math.max(0, usedFilter); // keep note we applied passenger filter
    }
  }

  const delays = (passengerFiltered || chosen).map(r => r.delay_minutes).filter(n => !isNaN(n));
  const meanDelay = Math.round(avg(delays) * 10) / 10;
  const variance = avg(delays.map(d => Math.pow(d - meanDelay, 2)));
  const std = Math.sqrt(variance || 0);

  // Confidence heuristic
  const count = delays.length;
  let confidence = Math.min(95, Math.round(50 + Math.min(100, count) * 0.4 - std * 0.5));
  if (count === 0) confidence = 30;

  const status = meanDelay > 10 ? 'High Delay' : meanDelay > 2 ? 'Minor Delay' : 'On Time';

  const reasons = [];
  if (usedFilter === 0) reasons.push({ factor: 'Route+Weather+Hour matched', count });
  else if (usedFilter === 1) reasons.push({ factor: 'Route+Hour matched', count });
  else if (usedFilter === 2) reasons.push({ factor: 'Route matched', count });
  else if (usedFilter === 3) reasons.push({ factor: 'Weather+Hour matched', count });
  else if (usedFilter === 4) reasons.push({ factor: 'Weather matched', count });
  else reasons.push({ factor: 'Global average', count });

  if (!isNaN(pc)) {
    reasons.push({ factor: `Passenger count filter ±${Math.max(Math.round(pc*0.2),10)}`, provided: pc });
  }

  if (w === 'rainy') reasons.push({ factor: 'Rainy weather', impact: '+8.5 min' });
  if ((hour >=7 && hour <=9) || (hour >=16 && hour <=19)) reasons.push({ factor: 'Peak hour', impact: '+6.0 min' });
  if (day_type === 'weekend') reasons.push({ factor: 'Weekend', impact: '-3.5 min' });

    return res.json({ delay: meanDelay || 0, confidence, status, reasons });
  })();
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Server running on port', PORT));
