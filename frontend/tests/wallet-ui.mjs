import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { mkdir } from 'node:fs/promises'
import { startFixture } from '../../backend/tests/uiFixture.js'
import Station from '../../backend/models/ChargingStation.js'
import Consumer from '../../backend/models/consumer.js'
import Booking from '../../backend/models/Booking.js'
let fixture, vite, browser
try {
  fixture = await startFixture({ fundWallet: false })
  const driver = await Consumer.findOne({ email: 'driver@example.test' })
  driver.batteries[0].maxAcChargingPowerKw = 7; await driver.save()
  const station = await Station.findOne({ stationCode: 'UI-TEST' })
  station.pointBookingEnabled = true; station.chargers[0].name = 'Wallet Dock'; station.chargers[0].pricePerKWh = 10; await station.save()
  vite = await createServer({ server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: `http://127.0.0.1:${fixture.port}` } } } }); await vite.listen()
  const baseURL = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch(); const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } }); const page = await context.newPage()
  const errors = []; page.on('pageerror', err => errors.push(err.message))
  await mkdir('test-results/wallet', { recursive: true })
  async function login(email) {
    await context.clearCookies()
    const { otp } = await (await context.request.post('/api/consumer/auth/login/request-otp', { data: { email } })).json()
    expect((await context.request.post('/api/consumer/auth/login/verify-otp', { data: { email, otp } })).ok()).toBeTruthy()
    await page.goto(baseURL); await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible()
  }
  async function menu(name) { await page.getByRole('button', { name: 'Open menu' }).click(); await page.getByRole('navigation', { name: 'More options' }).getByRole('button', { name, exact: true }).click() }
  await login('driver@example.test')
  const wallet = page.getByRole('region', { name: 'consumer BEE wallet' })
  await expect(wallet.locator('.wallet-balance')).toHaveText('₹0.00')
  await wallet.getByRole('button', { name: 'Add Money', exact: true }).click()
  await wallet.getByRole('button', { name: '₹100', exact: true }).click()
  await wallet.getByRole('button', { name: 'Review recharge' }).click()
  await wallet.screenshot({ path: 'test-results/wallet/recharge-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await wallet.screenshot({ path: 'test-results/wallet/recharge-mobile.png' })
  await wallet.getByRole('button', { name: 'Confirm recharge' }).click()
  await expect(wallet.locator('.wallet-balance')).toHaveText('₹100.00')
  await page.reload(); await expect(wallet.locator('.wallet-balance')).toHaveText('₹100.00')
  await wallet.getByText('Transaction history', { exact: true }).click()
  await expect(wallet.getByText('CREDIT · ₹100.00', { exact: true })).toBeVisible()
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const response = await context.request.post('/api/bookings', { headers: { 'Idempotency-Key': 'browser-wallet-payment' }, data: { stationId: station.id, chargingPointId: station.chargers[0].id, batteryId: driver.batteries[0].id, date: tomorrow, startTime: '10:00', endTime: '11:00', initialCharge: 20, finalCharge: 30 } })
  expect(response.status()).toBe(201)
  const { booking } = await response.json()
  await menu('My Orders')
  const upcoming = page.getByRole('region', { name: 'Upcoming Orders' })
  const current = page.getByRole('region', { name: 'Current Orders' })
  const finished = page.getByRole('region', { name: 'Completed Orders' })
  await expect(upcoming.getByText('Wallet Dock', { exact: false })).toBeVisible()
  await expect(upcoming.locator('.order-details-toggle')).toHaveCount(0)
  await upcoming.getByRole('button', { name: 'Show booking details' }).click()
  await expect(upcoming.getByText('Initial charge:', { exact: true })).toBeVisible()
  await page.clock.setFixedTime(new Date(booking.startAt).getTime() + 1000)
  await expect(current.getByText('Wallet Dock', { exact: false })).toBeVisible()
  await expect(upcoming.getByText('Wallet Dock', { exact: false })).toHaveCount(0)
  await page.clock.setFixedTime(new Date(booking.endAt).getTime() + 1000)
  await expect(current.getByText('Awaiting completion confirmation').first()).toBeVisible()
  await expect(finished.getByText('Wallet Dock', { exact: false })).toHaveCount(0)
  await Booking.updateOne({ _id: booking._id }, { $set: { startAt: new Date(Date.now() - 7200000), endAt: new Date(Date.now() - 3600000) } })
  page.on('dialog', dialog => dialog.accept())
  await expect(page.getByRole('button', { name: 'Confirm successful charging' })).toHaveCount(0)
  process.env.CHARGING_EVENT_TOKEN = 'test-charger-event-token-at-least-32-characters'
  const completed = await context.request.post('/api/wallet/bookings/' + booking._id + '/complete', { headers: { Authorization: 'Bearer ' + process.env.CHARGING_EVENT_TOKEN }, data: { successful: true } })
  expect(completed.status()).toBe(200)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(finished.getByText('Wallet payment · ₹40.00 · Paid', { exact: true })).toBeVisible()
  await expect(current.getByText('Wallet Dock', { exact: false })).toHaveCount(0)
  await page.reload(); await menu('My Orders')
  await expect(finished.getByText('Order completed', { exact: true })).toBeVisible()
  await menu('History')
  await expect(page.getByText('Wallet payment · ₹40.00 · Paid', { exact: true })).toBeVisible()
  await login('host@example.test'); await menu('Host')
  const host = page.getByRole('region', { name: 'host BEE wallet' })
  await expect(host.locator('.wallet-balance')).toHaveText('₹40.00')
  await expect(host.getByText('Completed paid sessions', { exact: true }).locator('..')).toContainText('1')
  for (const range of ['30', '6m', '7']) { await host.getByLabel('Earnings over time').selectOption(range); await expect(host.locator('.wallet-bar-column')).toHaveCount(range === '6m' ? 6 : Number(range)) }
  await host.screenshot({ path: 'test-results/wallet/host-mobile.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.setViewportSize({ width: 1440, height: 1000 }); await host.screenshot({ path: 'test-results/wallet/host-desktop.png' })
  await page.reload(); await menu('Host'); await expect(host.locator('.wallet-balance')).toHaveText('₹40.00')
  expect(errors).toEqual([])
  console.log('PASS wallet demo recharge, refresh, history, paid booking, successful completion, host earnings filters, mobile/desktop layouts and no page errors.')
} finally { await browser?.close(); await vite?.close(); await fixture?.close() }
