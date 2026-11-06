import { readFile } from 'node:fs/promises'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { importDemoStations, prepareDemoStations } from '../services/demoChargingPoints.js'
dotenv.config()
try {
  const file = process.argv[2]
  if (!file) throw new Error('Usage: node scripts/seedMangalorePoints.js path-to-15-stations.json [--apply]. Without --apply, validates only.')
  const rows = JSON.parse(await readFile(file, 'utf8'))
  const prepared = prepareDemoStations(rows)
  console.log(`Validated ${prepared.length} fictional stations with ${prepared.reduce((sum, s) => sum + s.chargers.length, 0)} charging points.`)
  if (process.argv.includes('--apply')) {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.')
    await mongoose.connect(process.env.MONGODB_URI)
    await importDemoStations(rows, mongoose.connection)
    console.log('Demo stations imported. Existing coordinates, bookings and user-managed stations preserved.')
  }
} catch (error) { console.error(error.message); process.exitCode = 1 }
finally { await mongoose.disconnect() }
