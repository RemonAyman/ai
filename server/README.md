Server README
==============

This small Express server uses the CSV at `model/cleaned_transport_data (2).csv` as the dataset.

Quick start:

1. Open a terminal in `server/` and install dependencies:

```bash
cd server
npm install
```

2. Start the server:

```bash
npm start
```

The server listens on port `5000` by default and exposes:
- `POST /api/auth/signup` { email, password, name }
- `POST /api/auth/login` { email, password }
- `POST /api/predict` { route_id, scheduled_time, weather, day_type }

The frontend `ModelApp` is configured to call `http://localhost:5000`.
