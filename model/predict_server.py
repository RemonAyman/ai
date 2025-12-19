from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import os
import numpy as np
import sqlite3
import json
import pandas as pd
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
CORS(app)

BASE = os.path.dirname(__file__)
ART = os.path.join(BASE, 'artifacts')

MODEL_PATH = os.path.join(ART, 'model.pkl')
LE_ROUTE_PATH = os.path.join(ART, 'le_route.pkl')
LE_WEATHER_PATH = os.path.join(ART, 'le_weather.pkl')
METADATA_PATH = os.path.join(ART, 'metadata.pkl')

model = None
le_route = None
le_weather = None
metadata = None

def load_artifacts():
    global model, le_route, le_weather, metadata
    if os.path.exists(MODEL_PATH):
        model = joblib.load(MODEL_PATH)
        print("✅ Model loaded successfully")
    else:
        print("⚠️ Model not found, using fallback prediction")
        
    if os.path.exists(LE_ROUTE_PATH):
        le_route = joblib.load(LE_ROUTE_PATH)
    if os.path.exists(LE_WEATHER_PATH):
        le_weather = joblib.load(LE_WEATHER_PATH)
    if os.path.exists(METADATA_PATH):
        metadata = joblib.load(METADATA_PATH)

# Auth DB
AUTH_DB = os.path.join(BASE, 'auth.sqlite')

def init_auth_db():
    conn = sqlite3.connect(AUTH_DB)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        password_hash TEXT,
        name TEXT
    )''')
    conn.commit()
    conn.close()

init_auth_db()
load_artifacts()

def featurize(payload):
    r = (payload.get('route_id') or 'R1').upper().strip()
    w = (payload.get('weather') or 'sunny').lower().strip()
    scheduled = payload.get('scheduled_time') or '08:00'
    
    hour = 8
    try:
        if ':' in str(scheduled):
            hour = int(str(scheduled).split(':')[0])
        else:
            hour = int(str(scheduled)[:2]) if len(str(scheduled)) >= 2 else 8
    except:
        hour = 8
    
    is_peak = 1 if (7 <= hour <= 9 or 16 <= hour <= 19) else 0
    
    # Encode route
    try:
        route_code = int(le_route.transform([r])[0]) if le_route is not None else 0
    except:
        route_code = 0
    
    # Encode weather
    try:
        weather_code = int(le_weather.transform([w])[0]) if le_weather is not None else 0
    except:
        weather_code = 0
    
    features = np.array([[hour, is_peak, weather_code, route_code]])
    return features, hour, is_peak, w

@app.route('/predict', methods=['POST'])
@app.route('/api/predict', methods=['POST'])
def predict():
    payload = request.get_json() or {}
    
    try:
        features, hour, is_peak, weather = featurize(payload)
        
        # Predict using model if available
        if model is not None:
            pred = model.predict(features)
            delay = float(pred[0])
        else:
            # Fallback heuristic prediction
            delay = 0
            if weather == 'rainy':
                delay += 8.5
            elif weather == 'foggy':
                delay += 5.2
            elif weather == 'cloudy':
                delay += 1.5
            
            if is_peak:
                delay += 6.0
            else:
                delay -= 2.0
            
            delay = max(0, delay)
        
        # Determine status
        if delay > 10:
            status = 'High Delay'
        elif delay > 5:
            status = 'Moderate Delay'
        elif delay > 0:
            status = 'Minor Delay'
        else:
            status = 'On Time'
        
        # Generate reasons
        reasons = []
        if weather == 'rainy':
            reasons.append({'factor': 'طقس ممطر / Rainy Weather', 'impact': '+8.5 دقيقة'})
        elif weather == 'foggy':
            reasons.append({'factor': 'ضباب / Foggy Conditions', 'impact': '+5.2 دقيقة'})
        elif weather == 'cloudy':
            reasons.append({'factor': 'غيوم / Cloudy Sky', 'impact': '+1.5 دقيقة'})
        else:
            reasons.append({'factor': 'طقس جيد / Good Weather', 'impact': 'إيجابي'})
        
        if is_peak:
            reasons.append({'factor': 'وقت الذروة / Peak Hour', 'impact': '+6.0 دقيقة'})
        else:
            reasons.append({'factor': 'وقت عادي / Off-Peak', 'impact': 'إيجابي'})
        
        confidence = 85 if model is not None else 70
        
        return jsonify({
            'delay': round(delay, 1),
            'status': status,
            'confidence': confidence,
            'reasons': reasons
        })
        
    except Exception as e:
        print(f"❌ Prediction error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/auth/signup', methods=['POST'])
@app.route('/api/auth/signup', methods=['POST'])
def auth_signup():
    payload = request.get_json() or {}
    email = payload.get('email')
    password = payload.get('password')
    name = payload.get('name') or ''
    
    if not email or not password:
        return jsonify({'success': False, 'error': 'البريد وكلمة المرور مطلوبان'})
    
    conn = sqlite3.connect(AUTH_DB)
    c = conn.cursor()
    c.execute('SELECT email FROM users WHERE email=?', (email,))
    
    if c.fetchone():
        conn.close()
        return jsonify({'success': False, 'error': 'المستخدم موجود بالفعل'})
    
    ph = generate_password_hash(password)
    c.execute('INSERT INTO users(email,password_hash,name) VALUES(?,?,?)', (email, ph, name))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'user': {'email': email, 'name': name}})


@app.route('/auth/login', methods=['POST'])
@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    payload = request.get_json() or {}
    email = payload.get('email')
    password = payload.get('password')
    
    if not email or not password:
        return jsonify({'success': False, 'error': 'البريد وكلمة المرور مطلوبان'})
    
    conn = sqlite3.connect(AUTH_DB)
    c = conn.cursor()
    c.execute('SELECT password_hash,name FROM users WHERE email=?', (email,))
    row = c.fetchone()
    conn.close()
    
    if not row:
        return jsonify({'success': False, 'error': 'بيانات خاطئة'})
    
    ph, name = row
    if not check_password_hash(ph or '', password):
        return jsonify({'success': False, 'error': 'بيانات خاطئة'})
    
    return jsonify({'success': True, 'user': {'email': email, 'name': name or ''}})


@app.route('/routes', methods=['GET'])
@app.route('/api/routes', methods=['GET'])
def api_routes():
    """يقرأ الطرق من ملف CSV الحقيقي"""
    try:
        # جرب مسارات مختلفة للـ CSV
        possible_paths = [
            os.path.join(BASE, 'cleaned_transport_data (2).csv'),
            os.path.join(BASE, '..', 'cleaned_transport_data (2).csv'),
            'cleaned_transport_data (2).csv'
        ]
        
        csv_path = None
        for path in possible_paths:
            if os.path.exists(path):
                csv_path = path
                break
        
        if not csv_path:
            print("⚠️ CSV not found, using default routes")
            return jsonify({'routes': ['R1', 'R2', 'R3', 'R4']})
        
        # اقرأ الـ CSV
        df = pd.read_csv(csv_path)
        
        if 'route_id' in df.columns:
            routes = sorted(df['route_id'].dropna().unique().tolist())
            print(f"✅ Loaded {len(routes)} routes from CSV")
            return jsonify({'routes': routes})
        else:
            print("⚠️ route_id column not found")
            return jsonify({'routes': ['R1', 'R2', 'R3', 'R4']})
            
    except Exception as e:
        print(f"❌ Error reading routes: {str(e)}")
        return jsonify({'routes': ['R1', 'R2', 'R3', 'R4']})


@app.route('/')
def home():
    return jsonify({
        'status': 'running',
        'message': '🚌 Transport Delay Prediction API',
        'endpoints': ['/api/predict', '/api/routes', '/api/auth/login', '/api/auth/signup']
    })


if __name__ == '__main__':
    print("=" * 50)
    print("🚀 Starting Transport Delay Prediction Server")
    print("=" * 50)
    print("📍 Server: http://127.0.0.1:5000")
    print("📊 API Endpoints:")
    print("   • POST /api/predict - التنبؤ بالتأخير")
    print("   • GET  /api/routes - قائمة الطرق")
    print("   • POST /api/auth/login - تسجيل دخول")
    print("   • POST /api/auth/signup - تسجيل جديد")
    print("=" * 50)
    
    app.run(host='127.0.0.1', port=5000, debug=True)