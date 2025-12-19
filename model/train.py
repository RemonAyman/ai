import pandas as pd
import numpy as np
import os
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error, r2_score


def train_model():
    csv_path = os.path.join(os.path.dirname(__file__), "cleaned_transport_data (2).csv")
    if not os.path.exists(csv_path):
        print(f"Error: Dataset not found at {csv_path}")
        return

    print("Loading Dataset...")
    df = pd.read_csv(csv_path)

    # --- Feature Selection & Engineering ---
    # The dataset appears to be already cleaned and has features, but we need to ensure consistent encoding.

    # 1. Route Encoding
    le_route = LabelEncoder()
    # Normalize route just in case
    df["route_id"] = df["route_id"].astype(str).str.upper().str.strip()
    df["route_code"] = le_route.fit_transform(df["route_id"])

    # 2. Weather Encoding
    le_weather = LabelEncoder()
    df["weather"] = df["weather"].astype(str).str.lower().str.strip()
    df["weather_code"] = le_weather.fit_transform(df["weather"])

    # 3. Time Features
    # Ensure hour_of_day exists, otherwise create it
    # 3. Time Features
    # Ensure hour_of_day exists, otherwise create it
    try:
        # parsed with errors='coerce' turns unparseable data into NaT
        df["scheduled_time"] = pd.to_datetime(df["scheduled_time"], errors="coerce")
        if "hour_of_day" not in df.columns:
            df["hour_of_day"] = df["scheduled_time"].dt.hour
    except Exception as e:
        print(f"Error parsing dates: {e}")
        return

    # Drop rows where time could not be parsed
    df = df.dropna(subset=["hour_of_day"])

    # 4. Peak Hour
    if "is_peak_hour" not in df.columns:
        df["is_peak_hour"] = df["hour_of_day"].apply(
            lambda h: 1 if (7 <= h <= 9 or 16 <= h <= 19) else 0
        )

    # Features to use for training
    # Note: We rely on what the user Inputs from Frontend: Route, Weather, Time -> we derive the rest.
    feature_cols = ["hour_of_day", "is_peak_hour", "weather_code", "route_code"]
    target_col = "delay_minutes"

    # Ensure all features exist and drop any remaining NaNs (better than filling with 0)
    df = df.dropna(subset=feature_cols + [target_col])

    X = df[feature_cols]
    y = df[target_col]

    # Handle NaN - we already dropped them, but just in case
    # X = X.fillna(0)  <-- Removing this generic zero-fill which caused issues

    print(f"Training on {len(df)} records with features: {feature_cols}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    # Try XGBoost first for better performance; fall back to RandomForest if not available
    try:
        import xgboost as xgb

        print("Training XGBoost Regressor...")
        model = xgb.XGBRegressor(n_estimators=200, random_state=42, verbosity=0)
        model.fit(X_train, y_train)
        model_name = "xgboost"
    except Exception as e:
        print(
            "XGBoost not available or failed, falling back to RandomForest. Error:", e
        )
        print("Training Random Forest Regressor...")
        model = RandomForestRegressor(n_estimators=100, random_state=42)
        model.fit(X_train, y_train)
        model_name = "random_forest"

    preds = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds)
    r2 = r2_score(y_test, preds)
    print(f"Model Results -> MAE: {mae:.2f} min, R2: {r2:.2f}")

    # Save Artifacts
    if not os.path.exists("model/artifacts"):
        os.makedirs("model/artifacts")

    joblib.dump(model, "model/artifacts/model.pkl")
    # Save a small metadata file
    joblib.dump(
        {"model_name": model_name, "feature_cols": feature_cols},
        "model/artifacts/metadata.pkl",
    )
    # Save encoders to map inputs correctly during prediction
    joblib.dump(le_route, "model/artifacts/le_route.pkl")
    joblib.dump(le_weather, "model/artifacts/le_weather.pkl")

    print("Model and Encoders saved to model/artifacts/")


if __name__ == "__main__":
    train_model()
