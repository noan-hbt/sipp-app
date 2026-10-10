import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium } from 'playwright-core'

const base = process.env.SIPP_TEST_URL ?? 'http://127.0.0.1:5173'
let browser
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.SIPP_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
})
after(async () => { await browser?.close() })

const blocks = [
  { type: 'hook', question: 'Combien coûte un prêt ?', teaser: 'Tu vas le calculer.', answer: 'Environ 90 900 € d’intérêts.' },
  { type: 'predict', kind: 'number', prompt: 'Ton estimation ?', min: 0, max: 200000, step: 1000, answer: 91000, unit: '€', reveal: 'Presque la moitié.' },
  { type: 'simulate', prompt: 'Et sur moins longtemps ?', parameter: 'Durée', parameter_unit: 'ans', output: 'Intérêts', output_unit: '€', points: [{ x: 10, y: 42988 }, { x: 20, y: 90871 }, { x: 25, y: 116702 }], start: 1, takeaway: 'Plus court = moins cher.' },
  { type: 'question', kind: 'single_choice', prompt: 'Qu’est-ce qui coûte le moins ?', options: [{ id: 'a', text: 'Une durée courte' }, { id: 'b', text: 'Une durée longue' }], correct_option_ids: ['a'], explanation: 'Moins de mois, moins d’intérêts.' },
  { type: 'swipe', cards: [{ statement: 'Carte un', is_true: true, why: 'Oui.' }, { statement: 'Carte deux', is_true: false, why: 'Non.' }, { statement: 'Carte trois', is_true: true, why: 'Oui.' }] },
  { type: 'recap', points: ['Plus long = plus cher'] },
]
const lesson = { id: 'L1', sip_id: 'S1', module_id: 'm', key: 'k', title: 'Le vrai coût d’un prêt', objective: 'o', concepts: [], status: 'ready', error: null, blocks, summary: null, concepts_taught: null, completed_at: null, stars: null, next_lesson_id: null, resume: null }

test('leçon v2 : accroche, pari, swipe, et chaque carte compte dans le score', async (t) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  t.after(() => context.close())
  await context.addInitScript(() => {
    localStorage.setItem('sipp.tokens', JSON.stringify({ access_token: `e30.${btoa(JSON.stringify({ sub: 'browser-test' }))}.sig`, refresh_token: 'test', expires_in: 900 }))
    localStorage.setItem('sipp.session', 'browser-test-session')
    localStorage.setItem('sipp.sound', 'off')
    localStorage.setItem('sipp.help-hint', '1')
    localStorage.setItem('sipp.keep-hint', '1')
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  let completed = null
  await page.route('**/*', async (route) => {
    const request = route.request()
    if (request.url().startsWith(base)) return route.continue()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } })
    const path = new URL(request.url()).pathname
    let body = {}
    if (path === '/lessons/L1') body = lesson
    else if (path === '/sips/S1') body = { id: 'S1', title: 'Crédit immobilier', theme: 'money', modules: [] }
    else if (path === '/me/notes') body = []
    else if (path === '/lessons/L1/complete') {
      completed = request.postDataJSON()
      return route.fulfill({ status: 500, json: {}, headers: { 'Access-Control-Allow-Origin': '*' } })
    }
    await route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  t.after(() => assert.deepEqual(errors, []))

  await page.goto(`${base}/lessons/L1`)
  await page.getByRole('heading', { name: 'Combien coûte un prêt ?' }).waitFor()
  await page.getByRole('button', { name: 'Je veux savoir' }).click()

  // The bet is not graded: no feedback sheet, Continue shows up once the guess is placed.
  await page.getByRole('button', { name: /Je parie/ }).click()
  await page.getByRole('button', { name: 'Continuer' }).click()

  await page.getByText('Plus court = moins cher.').waitFor({ timeout: 8000 })
  await page.getByRole('button', { name: 'Continuer' }).click()

  await page.getByText('Une durée courte').click()
  await page.locator('section[aria-live]').getByRole('button', { name: 'Continuer' }).click()

  // Swipe: right, wrong, right.
  for (const [pick, next] of [['Vrai', 'Carte suivante'], ['Vrai', 'Carte suivante'], ['Vrai', 'Voir le bilan']]) {
    await page.getByRole('button', { name: pick, exact: true }).click()
    await page.getByRole('button', { name: next }).click()
  }
  await page.getByText('2 sur 3').waitFor()
  await page.getByRole('button', { name: 'Continuer' }).click()

  await page.getByText('Question du début').waitFor()
  await page.getByRole('button', { name: 'Terminer la leçon' }).click()
  await page.waitForTimeout(500)
  assert.deepEqual(completed?.score, { correct: 3, total: 4 })
})
