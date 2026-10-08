import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import { hashKey, QueryClient } from '@tanstack/react-query'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8').replace('import.meta.env.VITE_API_URL', 'undefined')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText
const tokens = (user, suffix = '') => ({ access_token: `e30.${Buffer.from(JSON.stringify({ sub: user })).toString('base64url')}.${suffix}`, refresh_token: `${user}${suffix}`, expires_in: 900 })
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const deferred = () => {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

const resumeSource = readFileSync(new URL('../src/lib/resume.ts', import.meta.url), 'utf8')
const resumeCode = ts.transpileModule(resumeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText
function resumeQueue(api, lesson = 'lesson') {
  const module = {}
  const require = createRequire(import.meta.url)
  new Function('exports', 'require', `${resumeCode}\nexports.createQueue = createQueue`)(module, (name) => name === './api' ? api : require(name))
  return module.createQueue(lesson, api.getSessionId(), api.getSessionUserId())
}

function setup() {
  const storage = new Map()
  const stores = new Map()
  const events = new Map()
  const key = (url) => url instanceof Request ? url.url : String(url)
  globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) }
  globalThis.window = { addEventListener: (name, listener) => events.set(name, listener) }
  globalThis.caches = {
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map())
      const cache = stores.get(name)
      return {
        match: async (url) => cache.get(key(url))?.clone(),
        put: async (url, value) => cache.set(key(url), value.clone()),
        delete: async (url) => cache.delete(key(url)),
        keys: async () => [...cache.keys()].map((url) => new Request(url)),
      }
    },
  }
  globalThis.fetch = async () => { throw new TypeError('offline') }
  const api = {}
  new Function('exports', code)(api)
  return { ...api, stores, storage, events }
}

test('refresh rejeté purge QueryClient et isole les clés de la session suivante', async () => {
  const api = setup()
  const qc = new QueryClient({ defaultOptions: { queries: { queryKeyHashFn: (key) => hashKey([api.getSessionId(), ...key]) } } })
  api.onSessionChange(() => { void qc.cancelQueries(); qc.clear() })
  api.setTokens(tokens('A'))
  const firstSession = api.getSessionId()
  qc.setQueryData(['sips'], [{ id: 'A' }])
  globalThis.fetch = async (url) => response({}, url.endsWith('/auth/refresh') ? 403 : 401)
  await assert.rejects(api.Api.sips(), { name: 'AbortError' })
  assert.equal(api.getTokens(), null)
  assert.equal(qc.getQueryCache().getAll().length, 0)
  api.setTokens(tokens('B'))
  assert.notEqual(api.getSessionId(), firstSession)
  assert.equal(qc.getQueryData(['sips']), undefined)
})

test('refresh tardif ne réactive pas une session après logout', async () => {
  const api = setup()
  api.setTokens(tokens('A'))
  const started = deferred()
  const late = deferred()
  let refreshSignal
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/auth/refresh')) {
      refreshSignal = init.signal
      started.resolve()
      return late.promise
    }
    return response({}, url.endsWith('/auth/logout') ? 200 : 401)
  }
  const request = api.Api.sips()
  await started.promise
  const logout = api.Api.logout()
  assert.equal(api.getTokens(), null)
  assert.equal(refreshSignal.aborted, true)
  late.resolve(response(tokens('A', 'rotated')))
  await logout
  await assert.rejects(request, { name: 'AbortError' })
  assert.equal(api.getTokens(), null)
})

test('réponse A retardée est rejetée, cache B reste disponible hors ligne', async () => {
  const api = setup()
  api.setTokens(tokens('A'))
  const late = deferred()
  let oldSignal
  globalThis.fetch = async (_url, init) => { oldSignal = init.signal; return late.promise }
  const old = api.Api.sips()
  api.setTokens(null)
  api.setTokens(tokens('B'))
  assert.equal(oldSignal.aborted, true)
  late.resolve(response([{ id: 'A' }]))
  await assert.rejects(old, { name: 'AbortError' })
  globalThis.fetch = async () => response([{ id: 'B' }])
  assert.deepEqual(await api.Api.sips(), [{ id: 'B' }])
  await setImmediate()
  globalThis.fetch = async () => { throw new TypeError('offline') }
  assert.deepEqual(await api.Api.sips(), [{ id: 'B' }])
  api.setTokens(null)
  await setImmediate()
  assert.equal(api.stores.has('sipp-api'), false)
})

test('rotation normale conserve session et cache hors ligne', async () => {
  const api = setup()
  api.setTokens(tokens('A'))
  const session = api.getSessionId()
  let changes = 0
  api.onSessionChange(() => changes++)
  let calls = 0
  globalThis.fetch = async (url) => {
    if (url.endsWith('/auth/refresh')) return response(tokens('A', 'rotated'))
    return ++calls === 1 ? response({}, 401) : response([{ id: 'A' }])
  }
  assert.deepEqual(await api.Api.sips(), [{ id: 'A' }])
  assert.equal(api.getSessionId(), session)
  assert.equal(api.getSessionUserId(), 'A')
  assert.equal(changes, 0)
  await setImmediate()
  globalThis.fetch = async () => { throw new TypeError('offline') }
  assert.deepEqual(await api.Api.sips(), [{ id: 'A' }])
})

test('export privé ne rejoint jamais Cache Storage', async () => {
  const api = setup()
  api.setTokens(tokens('A'))
  globalThis.fetch = async () => response({ secret: 'export' })
  await api.Api.exportData()
  await setImmediate()
  assert.equal(api.stores.has('sipp-api'), false)
  globalThis.fetch = async () => { throw new TypeError('offline') }
  await assert.rejects(api.Api.exportData(), { name: 'TypeError' })
})

test('signal QueryClient transmis et aucune réponse après annulation', async () => {
  const api = setup()
  api.setTokens(tokens('A'))
  const controller = new AbortController()
  const late = deferred()
  let signal
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).searchParams.get('__sipp_session'), api.getSessionId())
    signal = init.signal
    return late.promise
  }
  const request = api.Api.sip('sip', controller.signal)
  controller.abort()
  assert.equal(signal.aborted, true)
  late.resolve(response({ id: 'sip' }))
  await assert.rejects(request, { name: 'AbortError' })
})

test('changement de compte dans un autre onglet purge cache et mémoire', async () => {
  const api = setup()
  api.setTokens(tokens('A'))
  globalThis.fetch = async () => response([{ id: 'A' }])
  await api.Api.sips()
  await setImmediate()
  let cleared = false
  api.onSessionChange(() => { cleared = true })
  api.storage.set('sipp.tokens', JSON.stringify(tokens('B')))
  api.storage.set('sipp.session', 'session-B')
  api.events.get('storage')({ key: 'sipp.tokens' })
  await setImmediate()
  assert.equal(cleared, true)
  assert.equal(api.getSessionUserId(), 'B')
  assert.equal(api.stores.has('sipp-api'), false)
})

test('reprises sérialisées, snapshots intermédiaires coalescés', async () => {
  const api = setup()
  api.setTokens(tokens('A'))
  const writes = []
  const first = deferred()
  const second = deferred()
  const secondStarted = deferred()
  let active = 0
  let maximum = 0
  globalThis.fetch = async (_url, init) => {
    writes.push(JSON.parse(init.body))
    maximum = Math.max(maximum, ++active)
    if (writes.length === 2) secondStarted.resolve()
    const result = await (writes.length === 1 ? first.promise : second.promise)
    active--
    return result
  }
  const queue = resumeQueue(api)
  queue.save({ step: 1, answers: [] })
  queue.save({ step: 2, answers: [] })
  queue.save({ step: 3, answers: [{ block: 1, value: 'réponse' }] })
  assert.equal(writes.length, 1)
  first.resolve(response({}))
  await secondStarted.promise
  assert.equal(JSON.parse(api.storage.get('sipp.resume.A.lesson')).step, 3)
  second.resolve(response({}))
  await queue.retry()
  assert.deepEqual(writes.map((r) => r.step), [1, 3])
  assert.equal(maximum, 1)
  assert.equal(queue.snapshot().status, 'saved')
  assert.equal(api.storage.has('sipp.resume.A.lesson'), false)
})

test('échec reprise conserve état durable pour rechargement et retry', async () => {
  const api = setup()
  api.setTokens(tokens('A'))
  const queue = resumeQueue(api)
  const latest = { step: 4, answers: [{ block: 2, value: 'texte' }] }
  queue.save(latest)
  await queue.retry()
  assert.equal(queue.snapshot().status, 'error')
  assert.equal(queue.snapshot().durable, true)
  const restored = resumeQueue(api)
  assert.deepEqual(restored.resume, latest)
  let saved
  globalThis.fetch = async (_url, init) => { saved = JSON.parse(init.body); return response({}) }
  await restored.retry()
  assert.deepEqual(saved, latest)
  assert.equal(restored.snapshot().status, 'saved')
  assert.equal(api.storage.has('sipp.resume.A.lesson'), false)
})

test('file ancienne session ne transmet pas les réponses au nouveau compte', async () => {
  const api = setup()
  api.setTokens(tokens('A'))
  const queue = resumeQueue(api)
  queue.save({ step: 2, answers: [] })
  await queue.retry()
  api.setTokens(tokens('B'))
  let calls = 0
  globalThis.fetch = async () => { calls++; return response({}) }
  await queue.retry()
  assert.equal(calls, 0)
  assert.equal(resumeQueue(api).resume, null)
})
