# BEE Charging

BEE Charging helps drivers find and book community-hosted EV charging stations. The project has a React/Vite frontend and an Express/MongoDB backend.

## Open and run in VS Code

1. Unzip the project and open the extracted `BEE-Charging` folder in VS Code.
2. Install Node.js 22.12 or newer and make sure MongoDB is running locally, or have a MongoDB connection URI ready.
3. In the VS Code terminal, create the backend environment file:

   ```sh
   cd backend
   cp .env.example .env
   ```

4. Edit `backend/.env` if needed. Set `MONGODB_URI` to the teammate's MongoDB URI and replace `SESSION_SECRET` with a long random value. Keep `.env` private; it is excluded from the project ZIP.
5. Install and start the backend in a terminal:

   ```sh
   cd backend
   npm install
   npm run dev
   ```

6. In a second terminal, install and start the frontend:

   ```sh
   cd frontend
   npm install
   npm run dev
   ```

7. Open the Vite URL printed in the terminal. The backend allows the default frontend address `http://localhost:5173`; if that port is already occupied, stop the other app using it before starting this one.

The frontend proxies `/api` requests to `http://localhost:5001`. The backend API listens on port `5001` by default; change `PORT` in `backend/.env` if needed.

## Project layout

- `frontend/` — React app, Vite configuration, styles, assets, and UI checks
- `backend/` — Express API, MongoDB models, route handlers, and station data scripts
- `backend/.env.example` — safe local configuration template

Dependencies are intentionally not bundled. Run `npm install` once in each folder to install them from the included lockfiles.
