import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createTapePreferences } from '../src/editor/services/tapePreferences.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/panels/DecorDrawer.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
const sizes = [{ id: 'standard', w: 180, h: 34 }, { id: 'wide', w: 200, h: 68 }]
const make = save => createTapePreferences({ load: async () => ({ size: 'wide', palette: 'sky', pattern: 'dot' }), save: save || (async () => true), sizes: sizes.map(s => s.id), palettes: ['sky', 'pink'], patterns: ['dot', 'solid'], defaultSize: 'standard' })
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
function drawer(store, callbacks = {}, ready = true) {
  const mocks = {
    react: { createContext: () => ({ Provider: 'provider' }), useContext: () => 4, useRef: value => ({ current: value }), useState: value => [typeof value === 'function' ? value() : value, () => {}] },
    'react-native': { View: 'view', Text: 'text', Platform: { OS: 'web', select: values => values.web }, StyleSheet: { create: value => value } },
    '../../../shared/theme': { colors: {}, radius: {}, shadow: {} },
    '../../constants': { TAPE_SIZES: sizes, TAPE_DEFAULT: { size: 'standard', palette: 'pink' }, TAPE_PATTERN_NAMES: { dot: '도트', solid: '무지' } },
    '../../hooks/useCustomDecor': { RECENT_LIMIT: 8, stickerKey: item => item.id, useCustomDecor: () => ({ loaded: true, items: { folders: [], favorites: [], recentStickers: [], categoryOrder: [], hiddenCategories: [], tapes: [] } }) },
    '../../hooks/useTapePreferences': { useTapePreferences: () => [store.getSnapshot(), store.update, ready] },
    '../../stickerAssets': { STICKER_GROUPS: [{ id: 'twemoji', items: [] }] },
    '../../hooks/usePan': { usePan: () => ({}) },
    '../ToolPanel': { toolPanelStyles: {}, ToolPanelHeader: 'header' },
    '../../utils/common': { clamp: value => value },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id }), module, module.exports)
  return module.exports.default({ tab: 'tape', ...callbacks })
}
const options = tree => nodes(tree).find(node => node.type === './TapeOptions')

test('복원·재마운트는 삽입하지 않고 무늬 선택 시 복원한 색·규격으로 한 장씩 추가한다', async () => {
  const store = make(), added = [], calls = { onAdd: item => added.push(item) }
  await store.ensureLoaded()
  assert.equal(options(drawer(store, calls)).props.tape.palette, 'sky')
  assert.equal(added.length, 0)
  options(drawer(store, calls)).props.onUpdate({ palette: 'custom:#AABBCC:#112233' })
  assert.equal(added.length, 0)
  options(drawer(store, calls)).props.onUpdate({ pattern: 'dot' })
  options(drawer(store, calls)).props.onUpdate({ pattern: 'dot' })
  assert.equal(added.length, 2)
  assert.deepEqual(added[0], { kind: 'tape', size: 'wide', palette: 'custom:#AABBCC:#112233', pattern: 'dot', edge: 'straight', name: '도트' })
})

test('복원 전 도구 입력을 막고 기본색으로 삽입한 경우 실제 색을 기억한다', async () => {
  const store = make()
  assert.equal(options(drawer(store, {}, false)), undefined)
  await store.ensureLoaded()
  await store.update({ palette: null })
  options(drawer(store, { onAdd() {} })).props.onUpdate({ pattern: 'solid' })
  assert.equal(store.getSnapshot().palette, 'pink')
})

test('설정 저장 실패를 안내해도 새 테이프 삽입·메모리 설정은 유지한다', async () => {
  const store = make(async () => false), notices = [], added = []
  await store.ensureLoaded()
  options(drawer(store, { onAdd: item => added.push(item), onToast: text => notices.push(text) })).props.onUpdate({ pattern: 'solid' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(added.length, 1)
  assert.equal(store.getSnapshot().pattern, 'solid')
  assert.match(notices[0], /설정을 저장하지 못했어요/)
})
