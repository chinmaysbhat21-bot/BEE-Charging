
import walletRoutes from './routes/wallet.js'
import express from 'express'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import cors from 'cors'
import session from 'express-session'
import MongoStore from 'connect-mongo'
import { fileURLToPath } from 'node:url'

import consumerAuthRoutes from './routes/consumerAuth.js'
import chargingStationsRoutes from './routes/chargingStations.js'
import bookingsRoutes from './routes/bookings.js'
import chargeGuardRoutes from './routes/chargeGuard.js'
import { completeEndedBookings } from './services/bookingCompletion.js'

dotenv.config()

const app = express()
const hosted = process.env.RENDER === 'true'

if (hosted) app.set('trust proxy', 1)

app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  })
)

app.use(express.json())

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
    }),
    cookie: {
      httpOnly: true,
      secure: hosted,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
)

const PORT = process.env.PORT || 5001

app.use('/api/consumer/auth', consumerAuthRoutes)
app.use('/api/charging-stations', chargingStationsRoutes)
app.use('/api/bookings', bookingsRoutes)
app.use('/api/wallet', walletRoutes)
  app.use('/api/chargeguard', chargeGuardRoutes)

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB')
    const runCompletion = async () => {
      try {
        await completeEndedBookings()
      } catch (error) {
        console.error('Booking completion sweep failed:', error.message)
      } finally {
        setTimeout(runCompletion, 30_000).unref()
      }
    }
    void runCompletion()
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message)
  })

if (hosted) app.use(express.static(fileURLToPath(new URL('../frontend/dist/', import.meta.url))))

app.get('/', (req, res) => {
  res.send('Consumer backend is running')
})

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
