import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const transform = file => expo('@babel/core').transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
const code = transform('../src/handwriting/fontShareConsent.js')

// 계정 단위 서버 값(여러 기기 = 여러 모듈이 나눠 쓴다)
function createServer() {
  const accounts = new Map(), calls = []
  return {
    accounts, calls, failLoads: 0, failSaves: 0, signedIn: null,
    api(account) {
      const server = this
      return {
        async load() { calls.push(['load', account]); if (server.failLoads-- > 0) throw Error('offline'); return accounts.get(account) ?? null },
        async save(value, { onlyIfNotAsked = false } = {}) {
          calls.push(['save', account, value, onlyIfNotAsked])
          if (server.failSaves-- > 0) throw Error('offline')
          if (!(onlyIfNotAsked && accounts.has(account))) accounts.set(account, value)
          return accounts.get(account)
        },
      }
    },
  }
}
const serverModule = server => ({ fontShareConsentServer: account => (server.signedIn === null || server.signedIn === account ? server.api(account) : null) })
const memoryStorage = (disk, { failReads = 0 } = {}) => ({
  getItem: async key => { if (failReads-- > 0) throw Error('read failed'); return disk.get(key) ?? null },
  setItem: async (key, value) => { disk.set(key, value) },
  removeItem: async key => { disk.delete(key) },
})

// 서버 · 기기 저장소 · 확인 창을 바꿔 끼운 새 모듈(모듈 안 캐시가 테스트마다 비어 있게 매번 새로 읽는다)
function load({ failReads = 0, server = createServer(), disk = new Map() } = {}) {
  const prompts = [], storage = memoryStorage(disk, { failReads })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'react') return { useEffect() {}, useState: value => [value, () => {}] }
    if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage }
    if (id === '../shared/dialogs') return { confirmAction: request => prompts.push(request) }
    if (id === './fontShareConsentServer') return serverModule(server)
    return require(id)
  }, module, module.exports)
  return { ...module.exports, disk, server, prompts }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const keyOf = account => `dio:member:v1:${account}:font-share-consent:v1`

test('설정(숫자 userId)과 편집 세션(문자 accountId)이 같은 계정 값을 본다', async () => {
  const consent = load()
  await consent.setFontShareConsent(7, 'denied')
  assert.equal(await consent.fontShareConsent('7'), 'denied')
  assert.equal(consent.server.accounts.get('7'), 'denied')
  assert.equal(consent.disk.has(keyOf(7)), false)
  assert.equal(await consent.askFontShareConsent('7'), false)
  assert.equal(consent.prompts.length, 0)
})

test('처음이면 한 번만 묻고 답을 서버에 저장한다', async () => {
  const consent = load()
  const first = consent.askFontShareConsent('3'), second = consent.askFontShareConsent(3)
  await tick()
  assert.equal(consent.prompts.length, 1)
  consent.prompts[0].onConfirm()
  assert.deepEqual([await first, await second], [true, true])
  assert.equal(consent.server.accounts.get('3'), 'granted')
  assert.equal(await consent.askFontShareConsent('3'), true)
  assert.equal(consent.prompts.length, 1)
})

test('다른 기기에서 답한 계정은 새 기기에서 묻지 않고, 설정 값도 같다', async () => {
  const server = createServer()
  const deviceA = load({ server })
  const asked = deviceA.askFontShareConsent('8')
  await tick()
  deviceA.prompts[0].onCancel()
  assert.equal(await asked, false)
  const deviceB = load({ server })
  assert.equal(await deviceB.askFontShareConsent('8'), false)
  assert.equal(deviceB.prompts.length, 0)
  assert.equal(await deviceB.fontShareConsent('8'), 'denied')
  // 기기 B 설정에서 켜면 기기 A 도 새로 읽을 때(설정 화면을 열 때) 같은 값을 본다
  await deviceB.setFontShareConsent('8', 'granted')
  assert.equal(await deviceA.fontShareConsent('8', { fresh: true }), 'granted')
})

test('기기에만 있던 예전 답은 다음 실행 때 서버로 옮기고 기기 값은 지운다', async () => {
  const server = createServer()
  const consent = load({ server, disk: new Map([[keyOf(11), 'granted']]) })
  assert.equal(await consent.syncFontShareConsent(11), 'granted')
  assert.equal(server.accounts.get('11'), 'granted')
  assert.deepEqual(server.calls.at(-1), ['save', '11', 'granted', true])
  assert.equal(consent.disk.has(keyOf(11)), false)
  assert.equal(await load({ server }).fontShareConsent('11'), 'granted')
})

test('옮길 때 다른 기기에서 먼저 고른 답이 있으면 그 값을 따르고 기기 값은 버린다', async () => {
  const server = createServer()
  server.accounts.set('12', 'denied')
  const consent = load({ server, disk: new Map([[keyOf(12), 'granted']]) })
  assert.equal(await consent.fontShareConsent('12'), 'denied')
  assert.equal(server.accounts.get('12'), 'denied')
  assert.equal(server.calls.some(call => call[0] === 'save'), false)
  assert.equal(consent.disk.has(keyOf(12)), false)
})

test('서버를 읽지 못하면 묻지 않고 거부처럼 처리하며, 그 결과를 기억하지 않는다', async () => {
  const server = createServer()
  server.accounts.set('5', 'denied')
  server.failLoads = 1
  const consent = load({ server })
  assert.equal(await consent.fontShareConsent('5'), 'unavailable')
  // 다음 호출에서 다시 읽어 예전에 고른 거부를 지킨다
  assert.equal(await consent.fontShareConsent('5'), 'denied')
  server.failLoads = 1
  assert.equal(await consent.askFontShareConsent('9'), false)
  assert.equal(consent.prompts.length, 0)
  assert.equal(server.accounts.has('9'), false)
})

test('기기 저장소를 읽지 못했고 서버에 답이 없으면 묻지 않는다(못 보낸 답이 있을 수 있다)', async () => {
  const consent = load({ failReads: 1 })
  assert.equal(await consent.askFontShareConsent('13'), false)
  assert.equal(consent.prompts.length, 0)
  assert.equal(await consent.fontShareConsent('13'), null)
})

test('이 계정으로 로그인한 세션이 없으면 읽지도 저장하지도 않는다', async () => {
  const consent = load()
  consent.server.signedIn = '1'
  assert.equal(await consent.fontShareConsent('2'), 'unavailable')
  await assert.rejects(consent.setFontShareConsent('2', 'granted'))
  assert.equal(consent.server.accounts.has('2'), false)
})

test('답을 서버에 저장하지 못하면 이번에는 다시 묻지 않고, 기기에 남겨 다음 실행 때 옮긴다', async () => {
  const server = createServer()
  server.failSaves = 1
  const consent = load({ server })
  const asked = consent.askFontShareConsent('14')
  await tick()
  consent.prompts[0].onConfirm()
  assert.equal(await asked, true)
  assert.equal(await consent.askFontShareConsent('14'), true)
  assert.equal(consent.prompts.length, 1)
  assert.equal(server.accounts.has('14'), false)
  assert.equal(consent.disk.get(keyOf(14)), 'granted')
  const next = load({ server, disk: consent.disk })
  assert.equal(await next.syncFontShareConsent('14'), 'granted')
  assert.equal(server.accounts.get('14'), 'granted')
  assert.equal(consent.disk.has(keyOf(14)), false)
})

test('고르지 않았는데 창이 닫히면(호스트가 사라짐 등) 거부로 저장하지 않고 다음에 다시 묻는다', async () => {
  const consent = load()
  const first = consent.askFontShareConsent('6')
  await tick()
  consent.prompts[0].onAbort()
  assert.equal(await first, false)
  assert.equal(consent.server.accounts.has('6'), false)
  assert.equal(await consent.fontShareConsent('6'), null)
  const second = consent.askFontShareConsent('6')
  await tick()
  assert.equal(consent.prompts.length, 2)
  consent.prompts[1].onCancel()
  assert.equal(await second, false)
  assert.equal(consent.server.accounts.get('6'), 'denied')
})

// 서버 API: 응답 모양 검사와 요청 본문
const apiCode = transform('../src/handwriting/fontShareConsentApi.js')
function loadApi() {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', apiCode)(require, module, module.exports)
  return module.exports
}

test('서버 API 는 상태를 앱 값으로 바꾸고, 옮기기 저장에 onlyIfNotAsked 를 보낸다', async () => {
  const { createFontShareConsentApi } = loadApi()
  const requests = []
  const replies = [{ status: 'NOT_ASKED', changedAt: null }, { status: 'GRANTED', changedAt: '2026-11-10T00:00:00Z' }, { status: 'DENIED', changedAt: '2026-11-10T00:00:00Z' }]
  const api = createFontShareConsentApi(async request => { requests.push(request); return replies.shift() })
  assert.equal(await api.load(), null)
  assert.equal(await api.save('granted', { onlyIfNotAsked: true }), 'granted')
  assert.equal(await api.save('denied'), 'denied')
  assert.deepEqual(requests, [
    { method: 'GET', path: '/handwriting-fonts/share-consent' },
    { method: 'PUT', path: '/handwriting-fonts/share-consent', body: { agreed: true, onlyIfNotAsked: true } },
    { method: 'PUT', path: '/handwriting-fonts/share-consent', body: { agreed: false, onlyIfNotAsked: false } },
  ])
})

test('서버 API 는 모르는 응답과 잘못된 값을 거부한다', async () => {
  const { createFontShareConsentApi } = loadApi()
  await assert.rejects(createFontShareConsentApi(async () => ({ status: 'MAYBE' })).load(), { code: 'INVALID_FONT_SHARE_CONSENT' })
  await assert.rejects(createFontShareConsentApi(async () => null).load(), { code: 'INVALID_FONT_SHARE_CONSENT' })
  await assert.rejects(createFontShareConsentApi(async () => ({ status: 'NOT_ASKED' })).save('granted'), { code: 'INVALID_FONT_SHARE_CONSENT' })
  await assert.rejects(createFontShareConsentApi(async () => ({ status: 'GRANTED' })).save('yes'))
})

// 설정 > 편집의 스위치(EditSetting): JSX 를 바꿔 읽고 화면 모듈은 가짜로 둔다
const settingCode = expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/components/EditSetting.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, filename: 'EditSetting.js',
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
function loadSetting() {
  const module = { exports: {} }, noop = () => null
  new Function('require', 'module', 'exports', settingCode)(id => ({
    'react/jsx-runtime': { jsx: noop, jsxs: noop, Fragment: noop },
    '../../shared/drawingInput': { DRAWING_INPUTS: [], setDrawingInput: noop, useDrawingInput: noop },
    '../../shared/penDynamics': { setPenDynamics: noop, usePenDynamics: () => ({}) },
    '../../shared/dialogs': { confirmAction: noop, notify: noop },
    '../../handwriting/fontShareConsent': { useFontShareConsent: () => ({ value: null, set: async () => {} }) },
    './SettingDropdown': { __esModule: true, default: noop },
    './SettingRow': { __esModule: true, default: noop, ON_OFF: [], SettingSection: noop },
  })[id] ?? require(id), module, module.exports)
  return module.exports
}

test('스위치는 실제로 올리는 상태(granted)만 켬으로 보인다', () => {
  const { fontShareSwitchValue } = loadSetting()
  assert.deepEqual(['granted', 'denied', null, 'unavailable'].map(fontShareSwitchValue), ['on', 'off', 'off', 'off'])
})

test('켜면 바로 저장하고, 끄면 확인한 뒤에만 저장하며, 저장 실패를 알린다', async () => {
  const { changeFontShare } = loadSetting()
  const saved = [], prompts = [], failures = []
  const set = async value => { saved.push(value); if (value === 'denied' && saved.length > 2) throw Error('write failed') }
  const options = { confirm: request => prompts.push(request), onFailed: () => failures.push('failed') }
  changeFontShare('on', set, options)
  changeFontShare('off', set, options)
  assert.deepEqual(saved, ['granted'])
  assert.equal(prompts[0].confirmLabel, '끄기')
  prompts[0].onConfirm()
  assert.deepEqual(saved, ['granted', 'denied'])
  changeFontShare('off', set, options)
  prompts[1].onConfirm()
  await tick()
  assert.deepEqual(failures, ['failed'])
})

test('설정 훅은 열 때 서버 값을 새로 읽어 보여 주고, 다른 곳에서 바꾸면 따라 바뀌며, 화면을 닫으면 듣기를 멈춘다', async () => {
  // useState · useEffect 를 기록하는 가짜 React 로 다시 읽는다
  const module = { exports: {} }, server = createServer()
  server.accounts.set('4', 'granted')
  const state = { value: undefined, cleanup: null }
  const react = {
    useState: initial => { if (state.value === undefined) state.value = initial; return [state.value, next => { state.value = next }] },
    useEffect: run => { state.cleanup = run() },
  }
  new Function('require', 'module', 'exports', code)(id => ({
    react,
    '@react-native-async-storage/async-storage': { __esModule: true, default: memoryStorage(new Map()) },
    '../shared/dialogs': { confirmAction() {} },
    './fontShareConsentServer': serverModule(server),
  })[id] ?? require(id), module, module.exports)
  // 이 기기가 예전에 읽어 둔 값이 있어도 설정 화면은 서버에서 새로 읽는다(다른 기기에서 바꾼 값)
  assert.equal(await module.exports.fontShareConsent('4'), 'granted')
  server.accounts.set('4', 'denied')
  const consent = module.exports.useFontShareConsent(4)
  await tick()
  assert.equal(state.value, 'denied')
  await module.exports.setFontShareConsent('4', 'granted')
  await tick()
  assert.equal(state.value, 'granted')
  await consent.set('denied')
  await tick()
  assert.equal(state.value, 'denied')
  state.cleanup()
  await module.exports.setFontShareConsent('4', 'granted')
  await tick()
  assert.equal(state.value, 'denied')
})
