import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from 'playwright-core'

test('PWA conserve cache B hors ligne après logout A et purge export', async (t) => {
  const base = process.env.SIPP_TEST_URL ?? 'http://127.0.0.1:4173'
  const browser = await chromium.launch({ executablePath: process.env.SIPP_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const tokens = (user) => ({ access_token: `e30.${Buffer.from(JSON.stringify({ sub: user })).toString('base64url')}.sig`, refresh_token: user, expires_in: 900 })
  await context.addInitScript((initial) => {
    if (localStorage.getItem('test.initialized')) return
    localStorage.setItem('test.initialized', '1')
    localStorage.setItem('sipp.tokens', JSON.stringify(initial))
    localStorage.setItem('sipp.session', 'session-A')
    localStorage.setItem('sipp.sound', 'off')
  }, tokens('A'))
  let offline = false
  await context.route('**/*', async (route) => {
    const request = route.request()
    if (request.url().startsWith(base)) return route.continue()
    if (offline) return route.abort('internetdisconnected')
    const path = new URL(request.url()).pathname
    const user = request.headers().authorization?.includes(tokens('B').access_token) ? 'B' : 'A'
    let body = {}
    if (path === '/auth/login') body = tokens('B')
    if (path === '/auth/me') body = { id: user, email: `${user}@example.com`, created_at: '2026-10-01' }
    if (path === '/auth/me/plan') body = { plan: 'free', on_trial: false, trial_available: false, slots: 1, slots_used: 1, sips_per_month: 3, sips_this_month: 1 }
    if (path === '/auth/me/stats') body = { streak_days: 1, completed_today: false, lessons_completed: 1, total_stars: 3 }
    if (path === '/me/review') body = { due_count: 0, cards: [] }
    if (path === '/sips') body = [{ id: user, title: `Sip du compte ${user}`, input_text: user, status: 'ready', progress: { completed: 0, total: 1 }, next_lesson_id: 'lesson', created_at: '2026-10-01' }]
    await route.fulfill({ status: 200, json: body, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(base)
  await page.getByText('Sip du compte A', { exact: true }).first().waitFor()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
  })
  await page.goto(`${base}/profile`)
  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click()
  await page.waitForFunction(() => localStorage.getItem('sipp.tokens') === null)
  await page.goto(`${base}/login`)
  await page.getByLabel('Email', { exact: true }).fill('B@example.com')
  await page.getByLabel('Mot de passe', { exact: true }).fill('password123')
  await page.getByRole('button', { name: 'Je me connecte', exact: true }).click()
  await page.getByText('Sip du compte B', { exact: true }).first().waitFor()
  await page.waitForFunction(async () => {
    const cache = await caches.open('sipp-api')
    for (const key of await cache.keys()) {
      if (new URL(key.url).pathname === '/sips') {
        const value = await (await cache.match(key)).json()
        if (value[0]?.id === 'B') return true
      }
    }
    return false
  })
  const contents = await page.evaluate(async () => {
    const cache = await caches.open('sipp-api')
    return Promise.all((await cache.keys()).map(async (key) => ({ url: key.url, body: await (await cache.match(key)).json() })))
  })
  assert.equal(contents.some((entry) => entry.url.includes('/auth/me/export')), false)
  assert.equal(contents.some((entry) => JSON.stringify(entry.body).includes('Sip du compte A')), false)
  offline = true
  await context.setOffline(true)
  await page.reload()
  await page.getByText('Sip du compte B', { exact: true }).first().waitFor()
  assert.equal(await page.getByText('Sip du compte A', { exact: true }).count(), 0)
  assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true)
  await page.goto(`${base}/profile`)
  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click()
  await page.waitForFunction(() => localStorage.getItem('sipp.tokens') === null)
  await page.waitForFunction(async () => !(await caches.has('sipp-api')))
  assert.deepEqual(errors, [])
})
