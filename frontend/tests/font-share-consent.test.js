import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/handwriting/fontShareConsent.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
// 저장소 · 확인 창을 바꿔 끼운 새 모듈(모듈 안 캐시가 테스트마다 비어 있게 매번 새로 읽는다)
function load({ failReads = 0 } = {}) {
  const disk = new Map(), prompts = []
  let reads = 0
  const storage = {
    getItem: async key => { reads++; if (failReads-- > 0) throw Error('read failed'); return disk.get(key) ?? null },
    setItem: async (key, value) => { disk.set(key, value) },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'react') return { useEffect() {}, useState: value => [value, () => {}] }
    if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage }
    if (id === '../shared/dialogs') return { confirmAction: request => prompts.push(request) }
    return require(id)
  }, module, module.exports)
  return { ...module.exports, disk, prompts, reads: () => reads }
}

test('설정(숫자 userId)과 편집 세션(문자 accountId)이 같은 계정 값을 본다', async () => {
  const consent = load()
  await consent.setFontShareConsent(7, 'denied')
  assert.equal(await consent.fontShareConsent('7'), 'denied')
  assert.equal(consent.disk.get('dio:member:v1:7:font-share-consent:v1'), 'denied')
  assert.equal(await consent.askFontShareConsent('7'), false)
  assert.equal(consent.prompts.length, 0)
})

test('처음이면 한 번만 묻고 답을 저장한다', async () => {
  const consent = load()
  const first = consent.askFontShareConsent('3'), second = consent.askFontShareConsent(3)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(consent.prompts.length, 1)
  consent.prompts[0].onConfirm()
  assert.deepEqual([await first, await second], [true, true])
  assert.equal(consent.disk.get('dio:member:v1:3:font-share-consent:v1'), 'granted')
  assert.equal(await consent.askFontShareConsent('3'), true)
  assert.equal(consent.prompts.length, 1)
})

test('저장소를 읽지 못하면 묻지 않고 거부처럼 처리하며, 그 결과를 기억하지 않는다', async () => {
  const consent = load({ failReads: 1 })
  consent.disk.set('dio:member:v1:5:font-share-consent:v1', 'denied')
  assert.equal(await consent.fontShareConsent('5'), 'unavailable')
  // 다음 호출에서 다시 읽어 예전에 고른 거부를 지킨다
  assert.equal(await consent.fontShareConsent('5'), 'denied')
  const failing = load({ failReads: 1 })
  assert.equal(await failing.askFontShareConsent('9'), false)
  assert.equal(failing.prompts.length, 0)
  assert.equal(failing.disk.has('dio:member:v1:9:font-share-consent:v1'), false)
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
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(failures, ['failed'])
})

test('설정 훅은 저장된 값을 보여 주고, 다른 곳에서 바꾸면 따라 바뀌며, 화면을 닫으면 듣기를 멈춘다', async () => {
  // useState · useEffect 를 기록하는 가짜 React 로 다시 읽는다
  const module = { exports: {} }, disk = new Map([['dio:member:v1:4:font-share-consent:v1', 'granted']])
  const state = { value: undefined, cleanup: null }
  const react = {
    useState: initial => { if (state.value === undefined) state.value = initial; return [state.value, next => { state.value = next }] },
    useEffect: run => { state.cleanup = run() },
  }
  new Function('require', 'module', 'exports', code)(id => ({
    react,
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => { disk.set(key, value) } } },
    '../shared/dialogs': { confirmAction() {} },
  })[id] ?? require(id), module, module.exports)
  const consent = module.exports.useFontShareConsent(4)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.value, 'granted')
  await module.exports.setFontShareConsent('4', 'denied')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.value, 'denied')
  await consent.set('granted')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.value, 'granted')
  state.cleanup()
  await module.exports.setFontShareConsent('4', 'denied')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.value, 'granted')
})
