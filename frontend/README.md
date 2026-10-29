# BEE Charging Frontend

React 19 and Vite frontend for the BEE Charging app.

## Run locally

From this directory:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). The Vite config proxies `/api` requests to the backend at `http://localhost:5001`, so run the backend from the repository root in a second terminal:

```sh
npm install
npm run dev
```

The backend requires its own `.env` file; see the repository root `README.md` and `.env.example`.

## Other commands

```sh
npm run build
npm run lint
```