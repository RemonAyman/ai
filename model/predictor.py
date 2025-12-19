import joblib
import pandas as pd
import os
import random


class TransportationPredictor:
    def __init__(self):
        self.model = None
        self.route_encoder = None
        self.weather_encoder = None
        self.load_model()

    def load_model(self):
        try:
            base_path = os.path.dirname(os.path.abspath(__file__))
            model_path = os.path.join(base_path, "artifacts", "model.pkl")
            # Correct filename based on train.py
            route_encoder_path = os.path.join(base_path, "artifacts", "le_route.pkl")
            weather_encoder_path = os.path.join(
                base_path, "artifacts", "le_weather.pkl"
            )

            if os.path.exists(model_path) and os.path.exists(route_encoder_path):
                self.model = joblib.load(model_path)
                self.route_encoder = joblib.load(route_encoder_path)
                # Load weather encoder if available
                if os.path.exists(weather_encoder_path):
                    self.weather_encoder = joblib.load(weather_encoder_path)
                else:
                    self.weather_encoder = None

                print("Trained model and encoders loaded successfully.")
            else:
                print("Model artifacts not found. Using fallback logic.")
        except Exception as e:
            print(f"Error loading model: {e}")

    def predict(self, route_id, scheduled_time, weather, day_type):
        """
        Predicts delay using the trained Random Forest model.
        """
        # Inference Logic
        reasons = []

        # 1. Feature Engineering (Match training logic)
        try:
            # Parse Time
            hour = 8
            if ":" in scheduled_time:
                hour = int(scheduled_time.split(":")[0])

            is_peak = 1 if (7 <= hour <= 9) or (16 <= hour <= 19) else 0

            # Weather mapping
            weather = weather.lower().strip()
            # Use encoder if available, otherwise heuristic fallback (which is risky if encoder is used in training)
            if self.weather_encoder:
                try:
                    # Encoders expect a list
                    weather_code = self.weather_encoder.transform([weather])[0]
                except ValueError:
                    # Fallback if unknown label
                    # Try to map common terms to known labels or default to 0
                    print(f"Warning: Unknown weather '{weather}', defaulting to 0")
                    weather_code = 0
            else:
                # Fallback manual mapping if encoder failed to load
                weather_map = {
                    "sunny": 0,
                    "cloudy": 1,
                    "foggy": 2,
                    "rainy": 3,
                    "rain": 3,
                    "clear": 0,
                }
                weather_code = weather_map.get(weather, 0)

            # Route Encoding
            # train.py does: .astype(str).str.upper().str.strip()
            # It relies on the raw route_id e.g. "R1", "Route 1"
            route_id_clean = route_id.upper().strip()

            route_code = 0
            if self.route_encoder:
                try:
                    route_code = self.route_encoder.transform([route_id_clean])[0]
                except:
                    print(f"Warning: Unknown route '{route_id_clean}', defaulting to 0")
                    route_code = 0  # Default/Unknown

            # Construct Input Vector
            # features = ["hour_of_day", "is_peak_hour", "weather_code", "route_code"]
            # MATCHING TRAIN.PY EXACTLY
            features = pd.DataFrame(
                [
                    {
                        "hour_of_day": hour,
                        "is_peak_hour": is_peak,
                        "weather_code": weather_code,
                        "route_code": route_code,
                    }
                ]
            )

            if self.model:
                predicted_delay = self.model.predict(features)[0]
                confidence = 0.92  # ML models usually don't give "confidence" easily in regression without intervals, static for now
            else:
                # Fallback if model not trained yet
                predicted_delay = 5.0 if is_peak else 0.0
                confidence = 0.5

            # Generate Explanations (Post-hoc based on feature values)
            if weather_code == 3:
                reasons.append({"factor": "Weather (Rainy)", "impact": "High Impact"})
            elif weather_code == 2:
                reasons.append(
                    {"factor": "Weather (Foggy)", "impact": "Moderate Impact"}
                )

            if is_peak:
                reasons.append(
                    {"factor": "Peak Hour Traffic", "impact": "High Delay Risk"}
                )
            else:
                reasons.append({"factor": "Off-Peak Travel", "impact": "Favorable"})

            status = "On Time"
            if predicted_delay > 15:
                status = "Severe Delay"
            elif predicted_delay > 5:
                status = "High Delay"
            elif predicted_delay > 0:
                status = "Minor Delay"

            return {
                "delay": round(predicted_delay, 1),
                "confidence": int(confidence * 100),
                "status": status,
                "reasons": reasons,
            }

        except Exception as e:
            print(f"Prediction Error: {e}")
            return {"delay": 0, "error": str(e), "reasons": []}
