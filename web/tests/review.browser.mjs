import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium } from 'playwright-core'

const base = process.env.SIPP_TEST_URL ?? 'http://127.0.0.1:5173'
let browser
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.SIPP_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
})
after(async () => { await browser?.close() })

const deferred = () => {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}
const card = (id) => ({ id, name: `Notion ${id}`, definition: 'Une définition', explanation: null, sip_id: 'sip', sip_title: 'Mon Sip', lesson_id: 'lesson', lesson_title: 'Ma leçon', mastery: 1, due: true, learned_at: '2026-10-01T12:00:00Z', last_reviewed_at: null })

async function pageFor(t, handler) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  t.after(() => context.close())
  await context.addInitScript(() => {
    localStorage.setItem('sipp.tokens', JSON.stringify({ access_token: `e30.${btoa(JSON.stringify({ sub: 'browser-test' }))}.sig`, refresh_token: 'test', expires_in: 900 }))
    localStorage.setItem('sipp.session', 'browser-test-session')
    localStorage.setItem('sipp.sound', 'off')
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/*', async (route) => {
    const request = route.request()
    if (request.url().startsWith(base)) return route.continue()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } })
    const result = await handler(new URL(request.url()).pathname, request)
    await route.fulfill({ status: result?.status ?? 200, json: result?.body ?? {}, headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  t.after(() => assert.deepEqual(errors, []))
  return page
}

test('Review affiche erreur initiale et réessaie sans exception', async (t) => {
  let fail = true
  const page = await pageFor(t, async (path) => path === '/me/review' ? { status: fail ? 500 : 200, body: { due_count: 1, cards: [card('A')] } } : undefined)
  await page.goto(`${base}/review`)
  await page.getByRole('alert').waitFor()
  assert.match(await page.getByRole('alert').innerText(), /cartes.*charger/)
  fail = false
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await page.getByRole('heading', { name: 'Notion A' }).waitFor()
})

test('Review attend succès, bloque double clic et garde carte après échec', async (t) => {
  const started = deferred()
  const release = deferred()
  let writes = 0
  const page = await pageFor(t, async (path, request) => {
    if (path === '/me/review') return { body: { due_count: 2, cards: [card('A'), card('B')] } }
    if (request.method() === 'POST' && path === '/me/review/A') {
      writes++
      if (writes === 1) { started.resolve(); await release.promise; return { status: 500 } }
      return { body: card('A') }
    }
  })
  await page.goto(`${base}/review`)
  await page.getByRole('button', { name: 'Retourner la carte' }).click()
  await page.getByRole('button', { name: 'Je savais' }).evaluate((button) => { button.click(); button.click() })
  await started.promise
  assert.equal(writes, 1)
  assert.equal(await page.getByRole('button', { name: 'Je savais' }).isDisabled(), true)
  assert.equal(await page.getByRole('heading', { name: 'Notion A' }).isVisible(), true)
  release.resolve()
  await page.getByRole('alert').waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Notion A' }).isVisible(), true)
  assert.equal(await page.getByRole('heading', { name: 'Révision finie !' }).count(), 0)
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await page.getByRole('heading', { name: 'Notion B' }).waitFor()
  assert.equal(writes, 2)
})

test('première leçon failed relancée par GET lesson sans reconstruire Sip', async (t) => {
  let lessonStatus = 'failed'
  let lessonReads = 0
  let rebuilds = 0
  const sip = () => ({ id: 'sip', title: 'Mon Sip', input_text: 'Test', status: 'ready', stage: null, error: null, progress: { completed: 0, total: 1 }, next_lesson_id: 'lesson', created_at: '2026-10-01', summary: null, profile: null, modules: [{ id: 'module', title: 'Module', position: 0, role: 'core', objectives: [], lessons: [{ id: 'lesson', key: 'l1', position: 0, title: 'Ma leçon', objective: '', concepts: [], prerequisites: [], status: lessonStatus, completed: false, stars: null }] }] })
  const page = await pageFor(t, async (path, request) => {
    if (path === '/sips/sip') return { body: sip() }
    if (path === '/sips/sip/retry') { rebuilds++; return { body: sip() } }
    if (path === '/lessons/lesson' && request.method() === 'GET') { lessonReads++; lessonStatus = 'queued'; return { body: { id: 'lesson', status: 'queued' } } }
  })
  await page.goto(`${base}/sips/sip/building`)
  await page.getByRole('heading', { name: 'Ta première leçon m’a résisté' }).waitFor()
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await page.getByRole('heading', { name: 'Je prépare ta première leçon…' }).waitFor()
  assert.equal(lessonReads, 1)
  assert.equal(rebuilds, 0)
})
