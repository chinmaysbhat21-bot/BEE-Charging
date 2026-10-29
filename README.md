# BEE Charging - Backend API

Express and MongoDB backend API for BEE Charging, supporting community-hosted EV charging station listings, bookings, and consumer authentication.

## Prerequisites

- Node.js 22.12 or newer
- MongoDB instance (local or MongoDB Atlas)

## Setup & Running

1. Copy `.env.example` to `.env`:
   ```sh
   cp .env.example .env
   ```
2. Configure `.env` variables (`MONGODB_URI`, `SESSION_SECRET`, `PORT`).
3. Install dependencies:
   ```sh
   npm install
   ```
4. Run in development mode:
   ```sh
   npm run dev
   ```

## API Routes

- `/api/consumer/auth` - Authentication & OTP verification
- `/api/charging-stations` - EV charging stations directory and status
- `/api/bookings` - Station booking management
