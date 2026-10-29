# BEE Charging

BEE Charging helps EV drivers find compatible community charging stations and plan bookings.

## Requirements

- Node.js 22.12 or newer
- MongoDB running locally or a MongoDB connection URI

## Setup

### 1. Configure the backend

```sh
cd backend
cp .env.example .env
```

Edit `backend/.env` and set `MONGODB_URI` and a long, private `SESSION_SECRET`.

### 2. Start the backend

From `backend/`:

```sh
npm install
npm run dev
```

### 3. Start the frontend

In a second terminal, from the project root:

```sh
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The frontend uses the backend at `http://localhost:5001`; keep Vite on port `5173` because the backend allows that origin by default.

## Default demo stations

After configuring `backend/.env`, run these commands from `backend/` to add the demo stations and refresh their opening hours and availability:

```sh
node scripts/seedChargingStations.js
node scripts/updateDemoStations.js
```

## Useful frontend commands

Run from `frontend/`:

```sh
npm run build
npm run lint
```

## Project structure

- `frontend/` — React and Vite application
- `backend/` — Express API, MongoDB models, routes, and data scripts

Keep `backend/.env` private. Do not commit database credentials or session secrets.
