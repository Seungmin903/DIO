import test from 'node:test'
import assert from 'node:assert/strict'
import { createPalettePreference } from '../src/editor/utils/palettePreference.js'
import { createPaletteSync } from '../src/editor/services/paletteSync.js'
import { normalizeHex } from '../src/editor/utils/penSettings.js'

const DEFAULTS = { pen: ['#111111', '#222222', '#333333'], tape: ['pink', 'mint'] }
const SCOPES = Object.keys(DEFAULTS)
const normalize = (scope, value) => scope === 'tape' ? (/^(pink|mint|sky)$/.test(value) || /^custom:#[0-9A-F]{6}:#[0-9A-F]{6}$/.test(value) ? value : null) : normalizeHex(value)

function memoryStorage() {
  const disk = new Map()
  return { disk, getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => { disk.set(key, value) }, removeItem: async key => { disk.delete(key) } }
}
// 같은 계정 서버(여러 기기가 함께 쓴다)
function fakeServer() {
  const server = { version: 0, palettes: {}, puts: 0, conflictOnce: null }
  server.api = {
    get: async () => ({ version: server.version, palettes: structuredClone(server.palettes) }),
    put: async (expected, palettes) => {
      if (server.conflictOnce) { const change = server.conflictOnce; server.conflictOnce = null; change() }
      if (expected !== server.version) throw Object.assign(Error('conflict'), { status: 409 })
      server.puts++; server.version++; server.palettes = structuredClone(palettes)
      return { version: server.version, palettes: structuredClone(palettes) }
    },
  }
  return server
}
// 기기 하나: 기기 저장소 + 도구별 팔레트 저장소 + 동기화
function device(server, account = '7', storage = memoryStorage()) {
  const stores = Object.fromEntries(SCOPES.map(scope => [scope, createPalettePreference(storage, `palette:${scope}`, DEFAULTS[scope], value => normalize(scope, value))]))
  const make = (who = account) => createPaletteSync({
    account: who, api: server.api, storage, key: 'sync',
    setTimer: (fn) => setTimeout(fn, 0), clearTimer: clearTimeout,
    palettes: {
      scopes: SCOPES, defaults: scope => DEFAULTS[scope], normalize,
      load: () => Promise.all(SCOPES.map(scope => stores[scope].load())),
      snapshot: scope => stores[scope].getSnapshot().colors,
      subscribe: listener => { const offs = SCOPES.map(scope => stores[scope].subscribe(listener)); return () => offs.forEach(off => off()) },
      apply: (scope, expected, colors) => stores[scope].apply(expected, colors),
    },
  })
  return { storage, stores, make, colors: scope => stores[scope].getSnapshot().colors }
}

test('한 기기에서 바꾼 팔레트를 다른 기기 · 재설치 기기에서 받는다', async () => {
  const server = fakeServer()
  const a = device(server); const syncA = a.make(); await syncA.start()
  assert.equal(server.puts, 0) // 기본 색 그대로면 올리지 않는다
  await a.stores.pen.replace(1, '#ABCDEF'); await a.stores.tape.replace(0, 'custom:#FFFFFF:#000000')
  await syncA.whenIdle()
  assert.deepEqual(server.palettes, { pen: ['#111111', '#ABCDEF', '#333333'], tape: ['custom:#FFFFFF:#000000', 'mint'] })

  const b = device(server); const syncB = b.make(); await syncB.start() // 새 기기(재설치와 같다)
  assert.deepEqual(b.colors('pen'), ['#111111', '#ABCDEF', '#333333'])
  assert.deepEqual(b.colors('tape'), ['custom:#FFFFFF:#000000', 'mint'])
  assert.equal(server.puts, 1) // 받기만 하고 다시 올리지 않는다
  // 받은 팔레트는 기기에 저장돼 앱을 다시 켜도 남는다
  const restored = createPalettePreference(b.storage, 'palette:pen', DEFAULTS.pen, value => normalize('pen', value)); await restored.load()
  assert.deepEqual(restored.getSnapshot().colors, ['#111111', '#ABCDEF', '#333333'])
  syncA.stop(); syncB.stop()
})

test('두 기기가 서로 다른 칸을 바꾸면 둘 다 남고, 처음 맞추는 기기의 바꾼 칸도 지켜진다', async () => {
  const server = fakeServer()
  const a = device(server); const syncA = a.make(); await syncA.start()
  const b = device(server); await b.stores.pen.replace(2, '#0000FF') // 로그인 전에 바꿔 둔 칸
  const syncB = b.make(); await syncB.start()
  await syncA.sync()
  assert.deepEqual(a.colors('pen'), ['#111111', '#222222', '#0000FF'])
  await a.stores.pen.replace(0, '#FF0000'); await syncA.whenIdle()
  await b.stores.tape.replace(1, 'sky'); await syncB.whenIdle()
  await syncA.sync()
  for (const d of [a, b]) {
    assert.deepEqual(d.colors('pen'), ['#FF0000', '#222222', '#0000FF'])
    assert.deepEqual(d.colors('tape'), ['pink', 'sky'])
  }
  syncA.stop(); syncB.stop()
})

test('저장 중 다른 기기가 먼저 바꾸면(409) 다시 받아 합친다', async () => {
  const server = fakeServer()
  const a = device(server); const syncA = a.make(); await syncA.start()
  server.conflictOnce = () => { server.version++; server.palettes = { pen: ['#111111', '#222222', '#999999'], tape: ['pink', 'mint'] } }
  await a.stores.pen.replace(0, '#FF0000'); await syncA.whenIdle()
  assert.deepEqual(server.palettes.pen, ['#FF0000', '#222222', '#999999'])
  assert.deepEqual(a.colors('pen'), ['#FF0000', '#222222', '#999999'])
  syncA.stop()
})

test('기본 색으로 되돌리면 다른 기기에서도 기본 색이 된다', async () => {
  const server = fakeServer()
  const a = device(server); const syncA = a.make(); await syncA.start()
  const b = device(server); const syncB = b.make(); await syncB.start()
  await a.stores.pen.replace(0, '#FF0000'); await syncA.whenIdle(); await syncB.sync()
  assert.equal(b.colors('pen')[0], '#FF0000')
  await a.stores.pen.reset(); await syncA.whenIdle(); await syncB.sync()
  assert.deepEqual(b.colors('pen'), DEFAULTS.pen)
  assert.equal(b.storage.disk.has('palette:pen'), false)
  syncA.stop(); syncB.stop()
})

test('다른 계정이 쓰던 기기는 그 계정 팔레트를 올리지 않고 이 계정 것을 받는다', async () => {
  const mine = fakeServer(), theirs = fakeServer()
  const storage = memoryStorage()
  const first = device(theirs, '1', storage); const s1 = first.make(); await s1.start()
  await first.stores.pen.replace(0, '#FF0000'); await s1.whenIdle(); s1.stop()
  const second = device(mine, '2', storage); const s2 = second.make(); await s2.start()
  assert.deepEqual(second.colors('pen'), DEFAULTS.pen)
  assert.equal(mine.puts, 0)
  s2.stop()
})

test('서버의 형식이 틀린 칸 · 모르는 도구는 기본 색으로 채운다', async () => {
  const server = fakeServer(); server.version = 3
  server.palettes = { pen: ['#ABCDEF', 'zzz'], tape: ['nope', 'sky'], future: ['#000000'] }
  const a = device(server); const sync = a.make(); await sync.start()
  assert.deepEqual(a.colors('pen'), ['#ABCDEF', '#222222', '#333333'])
  assert.deepEqual(a.colors('tape'), ['pink', 'sky'])
  sync.stop()
})

test('받는 동안 사용자가 바꾼 칸은 덮지 않고 이어서 올린다', async () => {
  const server = fakeServer(); server.version = 1; server.palettes = { pen: ['#ABCDEF', '#222222', '#333333'] }
  const a = device(server)
  const sync = a.make()
  const realGet = server.api.get
  server.api.get = async () => { const doc = await realGet(); server.api.get = realGet; await a.stores.pen.replace(2, '#00FF00'); return doc }
  await sync.start(); await sync.whenIdle()
  assert.deepEqual(a.colors('pen'), ['#ABCDEF', '#222222', '#00FF00'])
  assert.deepEqual(server.palettes.pen, ['#ABCDEF', '#222222', '#00FF00'])
  sync.stop()
})
