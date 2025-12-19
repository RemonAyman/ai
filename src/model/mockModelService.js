// Simple client-side mock prediction service
export const predictDelay = async (input) => {
  // input: { route_id, scheduled_time, weather, day_type }
  // Simulate async inference
  await new Promise(r => setTimeout(r, 800));

  const { weather, scheduled_time, day_type } = input;
  let predictedDelay = 0;
  let confidence = 0.85;
  const reasons = [];

  if (weather === 'rainy') {
    predictedDelay += 8.5; confidence -= 0.1;
    reasons.push({ factor: 'Weather (Rainy)', impact: '+8.5 min' });
  } else if (weather === 'foggy') {
    predictedDelay += 5.2; reasons.push({ factor: 'Weather (Foggy)', impact: '+5.2 min' });
  } else if (weather === 'cloudy') {
    predictedDelay += 1.5; reasons.push({ factor: 'Weather (Cloudy)', impact: '+1.5 min' });
  } else {
    predictedDelay -= 1.0; reasons.push({ factor: 'Weather (Sunny)', impact: '-1.0 min' });
  }

  const hour = parseInt((scheduled_time || '08:00').split(':')[0], 10) || 8;
  if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19)) {
    predictedDelay += 6.0; reasons.push({ factor: 'Peak Hour', impact: '+6.0 min' });
  } else {
    predictedDelay -= 2.0; reasons.push({ factor: 'Off-Peak', impact: '-2.0 min' });
  }

  if (day_type === 'weekend') { predictedDelay -= 3.5; reasons.push({ factor: 'Weekend', impact: '-3.5 min' }); }

  const noise = (Math.random() * 2) - 1;
  predictedDelay += noise;

  const result = {
    delay: Math.max(0, predictedDelay).toFixed(1),
    confidence: Math.round(confidence * 100),
    status: predictedDelay > 5 ? 'High Delay' : predictedDelay > 0 ? 'Minor Delay' : 'On Time',
    reasons
  };

  return result;
};
