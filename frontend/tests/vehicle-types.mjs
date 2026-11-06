import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { startFixture } from '../../backend/tests/uiFixture.js'
let fixture, server, browser
try {
  fixture = await startFixture()
  server = await createServer({ server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: `http://127.0.0.1:${fixture.port}` } } } })
  await server.listen()
  const baseURL = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch()
  const context = await browser.newContext({ baseURL })
  const api = context.request
  const email = 'driver@example.test'
  const { otp } = await (await api.post('/api/consumer/auth/login/request-otp', { data: { email } })).json()
  expect((await api.post('/api/consumer/auth/login/verify-otp', { data: { email, otp } })).ok()).toBeTruthy()
  const path = '/api/consumer/auth/profile/batteries'
  const battery = { name: 'Manual bike', vehicleType: 'bike', vehicleMake: 'Custom', vehicleModel: 'Scooter', capacityKwh: 3, batteryVoltage: 48, batteryChemistry: 'Other/Unknown', connectorTypes: ['Other'], maxAcChargingPowerKw: 0.5 }
  const saved = await api.post(path, { data: battery }); expect(saved.status()).toBe(201)
  const entries = (await saved.json()).batteries
  const created = entries.find((b) => b.name === battery.name)
  expect(created.vehicleType).toBe('bike'); expect(created.batteryVoltage).toBe(48)
  expect(entries.find((b) => b.name === 'Test EV').vehicleType).toBe('car')
  expect((await api.post(path, { data: battery })).status()).toBe(409)
  expect((await api.post(path, { data: { ...battery, name: 'Bad', vehicleType: 'truck' } })).status()).toBe(400)
  expect((await api.post(path, { data: { ...battery, name: 'Bad', batteryVoltage: -1 } })).status()).toBe(400)
  const { vehicleType: _type, batteryVoltage: _voltage, ...legacy } = battery
  const updated = await api.put(`${path}/${created._id}`, { data: legacy })
  expect((await updated.json()).batteries.find((b) => b._id === created._id).vehicleType).toBe('bike')
  expect((await api.post(path, { data: { ...legacy, name: 'Legacy car' } })).status()).toBe(201)
  const page = await context.newPage()
  await page.goto(baseURL)
  await page.getByRole('button', { name: 'My EV & profile' }).click()
  await page.getByRole('button', { name: '+ Add Battery', exact: true }).click()
  const choices = page.getByRole('group', { name: 'Vehicle type' })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    const boxes = await choices.locator('button').evaluateAll((nodes) => nodes.map((n) => ({ x: n.getBoundingClientRect().x, y: n.getBoundingClientRect().y })))
    expect(boxes[0].y).toBe(boxes[1].y); expect(boxes[0].x).toBeLessThan(boxes[1].x)
  }
  await choices.getByRole('button', { name: /Electric Bike/ }).click()
  await expect(page.locator('.ev-profile-option')).toHaveCount(5)
  await page.getByRole('button', { name: /TVS iQube/ }).click()
  await page.getByLabel('Choose your battery / trim').selectOption('3.5-kwh')
  await expect(page.getByLabel('Battery capacity (kWh)')).toHaveValue('3.5')
  await page.getByRole('button', { name: 'Clear selection' }).click()
  await page.getByRole('button', { name: 'Add Battery Manually' }).click()
  await page.getByLabel('Battery profile name').fill('Browser bike')
  await page.getByLabel('Vehicle make', { exact: true }).fill('Custom')
  await page.getByLabel('Vehicle model', { exact: true }).fill('Bike')
  await page.getByLabel('Battery capacity (kWh)').fill('3')
  await page.getByLabel('Battery voltage (V, optional)').fill('48')
  await page.getByLabel('Battery chemistry').selectOption('Other/Unknown')
  await page.getByLabel('Other / adapter-dependent', { exact: true }).check()
  await page.getByLabel('Maximum AC charging power (kW)').fill('0.5')
  await page.getByRole('button', { name: 'Save Battery', exact: true }).click()
  await expect(page.getByText('Browser bike', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '+ Add Battery', exact: true }).click()
  await choices.getByRole('button', { name: /Electric Car/ }).click()
  await expect(page.locator('.ev-profile-option')).toHaveCount(6)
  await page.getByRole('button', { name: /MG Windsor EV/ }).click()
  await page.getByLabel('Choose your battery / trim').selectOption('38-kwh')
  await expect(page.getByLabel('Battery capacity (kWh)')).toHaveValue('38')
  console.log('PASS vehicle API persistence, legacy defaults/update, duplicates, validation, mobile/desktop cards, five bikes, bike selection/manual save and existing car selection.')
} finally { await browser?.close(); await server?.close(); await fixture?.close() }
