
import express from 'express'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import cors from 'cors'
import session from 'express-session'
import MongoStore from 'connect-mongo'

import consumerAuthRoutes from './routes/consumerAuth.js'
import chargingStationsRoutes from './routes/chargingStations.js'
import bookingsRoutes from './routes/bookings.js'

dotenv.config()

const app = express()

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
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
)

const PORT = process.env.PORT || 5001

app.use('/api/consumer/auth', consumerAuthRoutes)
app.use('/api/charging-stations', chargingStationsRoutes)
app.use('/api/bookings', bookingsRoutes)

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB')
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message)
  })

app.get('/', (req, res) => {
  res.send('Consumer backend is running')
})

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
