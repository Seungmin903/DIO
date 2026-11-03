import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as eraser from '../src/editor/utils/eraser.js'
import * as pageGrid from '../src/editor/utils/pageGrid.js'
import * as text from '../src/editor/utils/text.js'
import * as penSettings from '../src/editor/utils/penSettings.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/utils/toolPreferences.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
function load(stored) {
  const writes = []
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'react') return { useCallback: fn => fn, useSyncExternalStore: (_subscribe, get) => get() }
    if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: {
      getItem: async () => stored, setItem: async (key, value) => { writes.push([key, value]) } } }
    if (id.endsWith('/eraser.js')) return eraser
    if (id.endsWith('/pageGrid.js')) return pageGrid
    if (id.endsWith('/text.js')) return text
    if (id.endsWith('/penSettings.js')) return penSettings
    return require(id)
  }, module, module.exports)
  return { ...module.exports, writes }
}

test('글자 기본값 · 격자 · 올가미 모양 · 종류별 펜 설정은 손상된 항목만 버리고 나머지는 기억한다', () => {
  const { sanitizeToolPreferences } = load(null)
  const result = sanitizeToolPreferences({
    textDefaults: { font: 'nanum-myeongjo', fontSize: 30, bold: true, italic: 'yes', color: 5, extra: 1 },
    guides: { grid: 'lines', spacing: 'wide', center: true, thirds: 'x', margin: false },
    lassoShape: 'freeform',
    penKinds: { ball: { width: 6, opacity: 0.9 }, pencil: { width: 'x' } },
  })
  assert.deepEqual({ font: result.textDefaults.font, fontSize: result.textDefaults.fontSize, bold: result.textDefaults.bold, italic: result.textDefaults.italic, color: result.textDefaults.color },
    { font: 'nanum-myeongjo', fontSize: 30, bold: true, italic: false, color: text.DEFAULT_TEXT_SETTINGS.color })
  assert.equal('extra' in result.textDefaults, false)
  assert.deepEqual(result.guides, { grid: 'lines', spacing: 'wide', center: true, thirds: false, margin: false })
  assert.equal(result.lassoShape, 'freeform')
  assert.deepEqual(result.penKinds.ball, { width: 6, opacity: 0.9 })
  assert.equal(sanitizeToolPreferences({ lassoShape: 'star', guides: 3, textDefaults: 'x' }).lassoShape, undefined)
  assert.deepEqual(sanitizeToolPreferences({ lassoShape: 'star', guides: 3, textDefaults: 'x' }), {})
})

test('설정 바꾸기는 이전 값을 받는 함수도 받고 잠잠해진 뒤 한 번에 저장한다', async () => {
  const { useToolPreference, writes } = load(null)
  const [, set] = useToolPreference('highlighter', { color: '#F7DF8A', width: 18 })
  set(current => ({ ...current, color: '#BDE4D1' }))
  set(current => ({ ...current, width: 30 }))
  assert.deepEqual(useToolPreference('highlighter', null)[0], { color: '#BDE4D1', width: 30 })
  await new Promise(resolve => setTimeout(resolve, 400))
  assert.equal(writes.length, 1)
  assert.deepEqual(JSON.parse(writes[0][1]).highlighter, { color: '#BDE4D1', width: 30 })
})
