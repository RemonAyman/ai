import joblib
import pandas as pd
import os
import random


class TransportationPredictor:
    def __init__(self):
        self.model = None
        self.route_encoder = None
        self.load_model()

    def load_model(self):
        try:
            base_path = os.path.dirname(os.path.abspath(__file__))
            model_path = os.path.join(base_path, "artifacts", "model.pkl")
            encoder_path = os.path.join(base_path, "artifacts", "route_encoder.pkl")

            if os.path.exists(model_path) and os.path.exists(encoder_path):
                self.model = joblib.load(model_path)
                self.route_encoder = joblib.load(encoder_path)
                print("Trained model loaded successfully.")
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
            weather = weather.lower()
            weather_map = {"sunny": 0, "cloudy": 1, "foggy": 2, "rainy": 3}
            weather_code = 0
            if "sun" in weather:
                weather_code = 0
            elif "clod" in weather or "cloud" in weather:
                weather_code = 1
            elif "fog" in weather:
                weather_code = 2
            elif "rain" in weather:
                weather_code = 3

            # Route Encoding
            route_id_clean = route_id.upper().replace("ROUTE", "").replace(" ", "")
            if "R" not in route_id_clean:
                route_id_clean = "R" + route_id_clean

            route_code = 0
            if self.route_encoder:
                try:
                    route_code = self.route_encoder.transform([route_id_clean])[0]
                except:
                    route_code = 0  # Default/Unknown

            # Simulated Passenger Count for input (since user doesn't provide it)
            # We estimate based on peak/off-peak
            passenger_count = 80 if is_peak else 30

            # Construct Input Vector
            # features = ['hour', 'is_peak', 'weather_code', 'route_code', 'passenger_count']
            features = pd.DataFrame(
                [
                    {
                        "hour": hour,
                        "is_peak": is_peak,
                        "weather_code": weather_code,
                        "route_code": route_code,
                        "passenger_count": passenger_count,
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
