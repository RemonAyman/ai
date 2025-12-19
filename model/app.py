from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
from predictor import TransportationPredictor

app = Flask(__name__)
CORS(app)

USERS_FILE = "users.json"
predictor = TransportationPredictor()


def load_users():
    if not os.path.exists(USERS_FILE):
        return {}
    try:
        with open(USERS_FILE, "r") as f:
            return json.load(f)
    except:
        return {}


def save_users(users):
    with open(USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)


@app.route("/api/auth/signup", methods=["POST"])
def signup():
    data = request.json
    email = data.get("email")
    password = data.get("password")
    name = data.get("name", "User")

    if not email or not password:
        return jsonify({"error": "Fields required"}), 400

    users = load_users()
    if email in users:
        return jsonify({"error": "User already exists"}), 400

    users[email] = {"password": password, "name": name}
    save_users(users)
    return jsonify({"success": True, "user": {"email": email, "name": name}})


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.json
    email = data.get("email")
    password = data.get("password")

    users = load_users()
    user = users.get(email)

    if not user or user["password"] != password:
        return jsonify({"error": "Invalid credentials"}), 401

    return jsonify({"success": True, "user": {"email": email, "name": user["name"]}})


@app.route("/api/predict", methods=["POST"])
def predict():
    data = request.json
    # Expected: route_id, scheduled_time, weather, day_type

    result = predictor.predict(
        route_id=data.get("route_id", "R1"),
        scheduled_time=data.get("scheduled_time", "08:00"),
        weather=data.get("weather", "sunny"),
        day_type=data.get("day_type", "weekday"),
    )

    return jsonify(result)


@app.route("/api/routes", methods=["GET"])
def get_routes():
    # Return list of routes for the frontend dropdown
    return jsonify({"routes": ["R1", "R2", "R3", "R4"]})


if __name__ == "__main__":
    print("Starting AI Model Server on port 5000...")
    app.run(debug=True, port=5000)
