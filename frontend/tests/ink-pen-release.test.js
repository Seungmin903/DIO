// v2.0.0 잉크펜(glass): 펜 종류에서 고를 수 있지만 꾸미기는 막는다(shared/featureFlags.js INK_PEN_CUSTOM_ENABLED).
// 정해 둔 3색(INK_PEN_COLORS)만 고르고, 팔레트 편집 · 직접 고르기 · 최근 색 · 글리터 · 테 설정과 공방 잉크펜 팔레트를 숨긴다.
// 잉크펜 자체를 끄면(INK_PEN_ENABLED) 고르는 곳에서 빠지고, 저장된 설정은 볼펜으로 돌아간다
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { INK_PEN_CUSTOM_ENABLED } from '../src/shared/featureFlags.js'
import * as penSettings from '../src/editor/utils/penSettings.js'
const { DEFAULT_GLASS_INK, INK_PEN_COLORS, limitInkPen } = penSettings

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const transform = path => expo('@babel/core').transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
const load = (path, resolve) => { const module = { exports: {} }; new Function('require', 'module', 'exports', transform(path))(resolve, module, module.exports); return module.exports }
const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]

// 내 프리셋 화면을 플래그 값만 바꿔 불러온다(color-picker-opening.test.js 와 같은 방식)
function loadPresets(inkPen, custom) {
  return load('../src/diary/components/StudioPresets.js', id => {
    if (id === 'react') return { useState: value => [value, () => {}] }
    if (id === 'react-native') return { View: 'view', Pressable: 'button', Text: 'text', StyleSheet: { create: v => v } }
    if (id === 'react/jsx-runtime') return require(id)
    if (id.endsWith('/featureFlags')) return { INK_PEN_ENABLED: inkPen, INK_PEN_CUSTOM_ENABLED: custom }
    if (id.endsWith('/theme')) return { colors: {} }
    return { __esModule: true, default: id }
  }).default
}
const scopes = Presets => Presets({}).props.children('100%').map(group => group.props.group.scope)

test('잉크펜을 끄거나 잉크펜 꾸미기를 끄면 내 프리셋에 잉크펜 색 줄이 없고, 둘 다 켜면 펜 다음에 나온다', () => {
  assert.deepEqual(scopes(loadPresets(false, true)), ['pen', 'highlighter', 'tape', 'text'])
  assert.deepEqual(scopes(loadPresets(true, false)), ['pen', 'highlighter', 'tape', 'text'])
  assert.deepEqual(scopes(loadPresets(true, true)), ['pen', 'glass', 'highlighter', 'tape', 'text'])
})

// 펜 설정 창을 플래그 값만 바꿔 그린다(자식 컴포넌트는 펼치지 않고 이름만 남긴다)
function renderPenSettings(custom) {
  const PenSettings = load('../src/editor/components/PenSettings.js', id => {
    if (id === 'react') return { useState: value => [value, () => {}], useRef: value => ({ current: value }), useMemo: fn => fn(), useEffect() {} }
    if (id === 'react-native') return { View: 'view', Pressable: 'button', Text: 'text', StyleSheet: { create: v => v } }
    if (id === 'react/jsx-runtime') return require(id)
    if (id.endsWith('/featureFlags')) return { INK_PEN_CUSTOM_ENABLED: custom }
    if (id.endsWith('/utils/penSettings')) return penSettings
    if (id.endsWith('/useRecentPenColors')) return { useRecentPenColors: () => ['#123456'] }
    if (id.endsWith('/usePalettes')) return { glassColors: () => ({}), glassEntry: () => '' }
    if (id.endsWith('/glassInk')) return { glitterColorOf: () => [0, 0, 0], micaColor: () => [0, 0, 0], sheenAutoColor: () => [0, 0, 0] }
    if (id.endsWith('/EditablePalette')) return { __esModule: true, default: 'EditablePalette', GlassDot: 'GlassDot', glassResolved: () => ({ ink: '#000000', sheen: '#000000' }), paletteSwatchStyles: {} }
    if (id.endsWith('/ToolPanel')) return { Segmented: 'Segmented', ToolPanelHeader: 'ToolPanelHeader', toolPanelStyles: {} }
    if (id.endsWith('/theme')) return { colors: {} }
    if (id.endsWith('/dashedStroke')) return { DASH_TYPES: [], DASH_LENGTH_RANGE: {}, DASH_GAP_RANGE: {}, dashPattern: () => null, isDashedKind: () => false }
    return { __esModule: true, default: id.split('/').pop(), justDragged: () => false, SettingSwitch: 'SettingSwitch' }
  }).default
  const changes = []
  const tree = PenSettings({ settings: { kind: 'glass', color: INK_PEN_COLORS[1], width: 4, ...DEFAULT_GLASS_INK }, onChange: next => changes.push(next) })
  return { all: nodes(tree), changes }
}

test('잉크펜 꾸미기를 끄면 펜 설정에 잉크 3색만 있고 팔레트 · 최근 색 · 글리터 · 테 설정이 없다', () => {
  const { all, changes } = renderPenSettings(false)
  assert.equal(all.some(n => n.type === 'EditablePalette'), false)
  assert.equal(all.some(n => n.props?.accessibilityLabel === '펜 최근 사용 색상'), false)
  assert.deepEqual(all.filter(n => n.type === 'Slider').map(n => n.props.name), ['굵기', '불투명도'])
  assert.equal(all.some(n => /글리터|테 색/.test(n.props?.accessibilityLabel ?? '')), false)
  const row = all.find(n => n.props?.accessibilityLabel === '잉크펜 색상' && n.type === 'view')
  const swatches = nodes(row.props.children).filter(n => n.type === 'button')
  assert.deepEqual(swatches.map(n => n.props.accessibilityLabel), ['잉크펜 색 1', '잉크펜 색 2', '잉크펜 색 3'])
  assert.deepEqual(swatches.map(n => n.props.accessibilityState.selected), [false, true, false])
  swatches[2].props.onPress()
  assert.equal(changes[0].color, INK_PEN_COLORS[2])
})

test('잉크펜 꾸미기를 켜면 팔레트 · 최근 색 · 글리터 · 테 설정이 그대로 있다', () => {
  const { all } = renderPenSettings(true)
  assert.ok(all.some(n => n.type === 'EditablePalette'))
  assert.ok(all.some(n => n.props?.accessibilityLabel === '펜 최근 사용 색상'))
  assert.deepEqual(all.filter(n => n.type === 'Slider').map(n => n.props.name), ['굵기', '불투명도', '글리터', '테'])
})

test('잉크펜 꾸미기를 끄면 잉크펜 설정은 3색 중 하나와 기본 글리터 · 테로 맞춘다', { skip: INK_PEN_CUSTOM_ENABLED && '잉크펜 꾸미기 켜짐' }, () => {
  assert.equal(INK_PEN_COLORS.length, 3)
  const custom = { kind: 'glass', color: '#ABCDEF', width: 20, opacity: 0.6, inkGlitter: false, inkFilm: 88, inkGlitterColor: '#112233', inkAmount: 0.3, inkSheenColor: '#445566', inkSheenAmount: 0.2 }
  assert.deepEqual(limitInkPen(custom), { kind: 'glass', color: INK_PEN_COLORS[0], width: 20, opacity: 0.6, ...DEFAULT_GLASS_INK })
  assert.equal(limitInkPen({ ...custom, color: INK_PEN_COLORS[2].toLowerCase() }).color, INK_PEN_COLORS[2])
  const ball = { kind: 'ball', color: '#ABCDEF', width: 3 }
  assert.equal(limitInkPen(ball), ball)
})

// 펜 설정 검사(penSettings → toolPreferences)를 플래그 값만 바꿔 불러온다 — 지금 스위치 값과 상관없이 끈 경로도 늘 검사한다
async function loadToolPreferences(flags) {
  const real = {
    dashed: await import('../src/editor/utils/dashedStroke.js'), eraser: await import('../src/editor/utils/eraser.js'),
    grid: await import('../src/editor/utils/pageGrid.js'), text: await import('../src/editor/utils/text.js'),
  }
  const pen = load('../src/editor/utils/penSettings.js', id => {
    if (id.endsWith('/featureFlags.js')) return flags
    if (id === './dashedStroke.js') return real.dashed
    throw Error('unexpected ' + id)
  })
  return load('../src/editor/utils/toolPreferences.js', id => {
    if (id === 'react') return { useCallback: fn => fn, useSyncExternalStore: () => null }
    if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: {} }
    if (id === './penSettings.js') return pen
    if (id === './eraser.js') return real.eraser
    if (id === './pageGrid.js') return real.grid
    if (id === './text.js') return real.text
    throw Error('unexpected ' + id)
  })
}

test('잉크펜을 끄면 기기에 저장된 펜 설정(잉크펜)을 불러올 때 볼펜으로 시작하고, 켜면 잉크펜 그대로다', async () => {
  const saved = { pen: { kind: 'glass', color: '#A33C4B', width: 24, opacity: 1, inkGlitter: true }, penKinds: { glass: { width: 24, opacity: 1 } } }
  const on = (await loadToolPreferences({ INK_PEN_ENABLED: true, INK_PEN_CUSTOM_ENABLED: false })).sanitizeToolPreferences(saved)
  assert.equal(on.pen.kind, 'glass')
  assert.equal(on.pen.width, 24)
  const { sanitizeToolPreferences } = await loadToolPreferences({ INK_PEN_ENABLED: false, INK_PEN_CUSTOM_ENABLED: false })
  const restored = sanitizeToolPreferences({
    pen: { kind: 'glass', color: '#A33C4B', width: 24, opacity: 1, inkGlitter: true },
    penKinds: { glass: { width: 24, opacity: 1 } },
  })
  assert.equal(restored.pen.kind, 'ball')
  assert.equal(restored.pen.width, 16) // 잉크펜만 32까지 — 볼펜 상한으로 맞춘다
  assert.equal('inkGlitter' in restored.pen, false)
  assert.ok(restored.penKinds.glass) // 기억은 남겨 다시 켜면 되살아난다
})
