import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { mkdir } from 'node:fs/promises'
import { startFixture } from '../../backend/tests/uiFixture.js'

let fixture, vite, browser
const errors = []
try {
  fixture = await startFixture()
  vite = await createServer({ server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: `http://127.0.0.1:${fixture.port}`, changeOrigin: true } } } })
  await vite.listen()
  const baseURL = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch()
  await mkdir('test-results/chargeguard', { recursive: true })
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  async function login(email) {
    await context.clearCookies()
    const otp = await (await context.request.post('/api/consumer/auth/login/request-otp', { data: { email } })).json()
    const verified = await context.request.post('/api/consumer/auth/login/verify-otp', { data: { email, otp: otp.otp } })
    expect(verified.ok()).toBeTruthy()
    await page.goto(baseURL)
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible()
  }
  async function menu(name) {
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.getByRole('navigation', { name: 'More options' }).getByRole('button', { name, exact: true }).click()
  }
  async function noOverflow() {
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((element) => element.getBoundingClientRect().right > window.innerWidth).map((element) => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right })).slice(0, 15))
    if (overflow.length) { console.log('Overflow:', overflow); await page.screenshot({ path: 'test-results/chargeguard/overflow.png', fullPage: true }) }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  }
  await login('driver@example.test')
  await menu('My Orders')
  await page.getByRole('button', { name: 'Report Charging Issue' }).click()
  await expect(page.getByLabel('Issue type')).toBeFocused()
  await page.getByLabel('Issue type').selectOption('charger_malfunction')
  await page.getByLabel('Explanation').fill('Charging did not start when connected.')
  await noOverflow()
  await page.screenshot({ path: 'test-results/chargeguard/consumer-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await noOverflow()
  await page.screenshot({ path: 'test-results/chargeguard/consumer-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Submit report', exact: true }).click()
  await expect(page.getByText('Your reservation may be at risk.')).toBeVisible()
  await menu('History')
  await page.getByRole('button', { name: 'Report Charging Issue' }).click()
  await expect(page.getByLabel('Issue type')).toBeVisible()
  await noOverflow()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await login('host@example.test')
  await menu('Host')
  await expect(page.getByText('PAUSED', { exact: true })).toBeVisible()
  await page.getByText('Open incident', { exact: true }).click()
  await page.getByLabel('What was the problem?').fill('Damaged connector.')
  await page.getByLabel('What did you fix?').fill('Replaced connector and completed a charging test.')
  await page.getByLabel('I performed a post-repair charging test.').check()
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await noOverflow()
  await page.screenshot({ path: 'test-results/chargeguard/host-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await noOverflow()
  await page.screenshot({ path: 'test-results/chargeguard/host-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Submit repair declaration' }).click()
  await expect(page.getByText('PROBATION', { exact: true })).toBeVisible()
  await expect(page.getByText('View repair declaration', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
  console.log('PASS browser: real session login, report, risk warning, history form, host repair, probation, desktop/mobile overflow and focus; no page errors.')
} finally {
  await browser?.close(); await vite?.close(); await fixture?.close()
}
