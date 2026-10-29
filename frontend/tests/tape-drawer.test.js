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
// 스티커 분류 계산(stickerLibrary)은 실제 모듈을 같은 가짜 의존성으로 불러 쓴다
const library = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/stickerLibrary.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
const load = (source, deps) => { const module = { exports: {} }; new Function('require', 'module', 'exports', source)(id => deps[id], module, module.exports); return module.exports }
const sizes = [{ id: 'standard', w: 180, h: 34 }, { id: 'wide', w: 200, h: 68 }]
const make = save => createTapePreferences({ load: async () => ({ size: 'wide', palette: 'sky', pattern: 'dot' }), save: save || (async () => true), sizes: sizes.map(s => s.id), palettes: ['sky', 'pink'], patterns: ['dot', 'solid'], defaultSize: 'standard' })
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
function drawer(store, callbacks = {}, ready = true, saveStatus = {}) {
  const mocks = {
    react: { createContext: () => ({ Provider: 'provider' }), useContext: () => 4, useRef: value => ({ current: value }), useState: value => [typeof value === 'function' ? value() : value, () => {}] },
    'react-native': { View: 'view', Text: 'text', Platform: { OS: 'web', select: values => values.web }, StyleSheet: { create: value => value } },
    '../../../shared/theme': { colors: {}, radius: {}, shadow: {} },
    '../../constants': { TAPE_SIZES: sizes, TAPE_DEFAULT: { size: 'standard', palette: 'pink' }, TAPE_PATTERN_NAMES: { dot: '도트', solid: '무지' } },
    '../../hooks/useCustomDecor': { RECENT_LIMIT: 8, stickerKey: item => item.id, useCustomDecor: () => ({ loaded: true, lastStickerCategory: saveStatus.items?.lastStickerCategory ?? null, items: { folders: [], favorites: [], recentStickers: [], categoryOrder: [], hiddenCategories: [], tapes: [] }, ...saveStatus }) },
    '../../hooks/useTapePreferences': { useTapePreferences: () => [store.getSnapshot(), store.update, ready] },
    '../../services/stickerSplit': { stickerSplit: { available: false } },
    '../../stickerAssets': { STICKER_GROUPS: [{ id: 'twemoji', items: [] }] },
    '../../hooks/usePan': { usePan: () => ({}) },
    '../ToolPanel': { toolPanelStyles: {}, ToolPanelHeader: 'header' },
    '../../utils/common': { clamp: value => value },
  }
  mocks['../../stickerLibrary'] = load(library, { './stickerAssets': mocks['../../stickerAssets'], './hooks/useCustomDecor': mocks['../../hooks/useCustomDecor'] })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id }), module, module.exports)
  return module.exports.default({ tab: 'tape', ...callbacks })
}
const options = tree => nodes(tree).find(node => node.type === './TapeOptions')
test('스티커 칩 복원·선택 저장과 삭제·숨김 칩은 비어 있지 않은 첫 칩으로 대체', () => {
  const picked = [], items = { folders: [{ id: 'mine', name: '내 폴더', items: [] }], favorites: [], recentStickers: [], categoryOrder: [], hiddenCategories: [], tapes: [], lastStickerCategory: 'folder:mine' }
  const render = () => drawer(make(), { tab: 'sticker' }, true, { items, setStickerCategory: id => picked.push(id) })
  const pills = () => nodes(render()).filter(node => node.type?.name === 'Pill')
  assert.equal(pills().find(node => node.props.active).props.label, '내 폴더')
  pills().find(node => node.props.label === 'Twemoji').props.onPress()
  assert.deepEqual(picked, ['twemoji'])
  // 즐겨찾기 · 최근이 비어 있으면 첫 분류로
  items.lastStickerCategory = 'folder:deleted'
  assert.equal(pills().find(node => node.props.active).props.label, 'Fluent Emoji')
  items.lastStickerCategory = 'twemoji'; items.hiddenCategories = ['twemoji']
  assert.equal(pills().find(node => node.props.active).props.label, 'Fluent Emoji')
  items.favorites = [{ id: 'a' }]
  assert.equal(pills().find(node => node.props.active).props.label, '즐겨찾기')
})

test('보관함은 훅의 저장 실패·진행 상태와 최신 내용 재시도를 안내에 전달한다', () => {
  const retrySave = () => Promise.resolve(true)
  const tree = drawer(make(), {}, true, { saveError: '저장 실패', savePending: true, retrySave })
  const notice = nodes(tree).find(node => node.type === './DecorSaveNotice')
  assert.equal(notice.props.error, '저장 실패')
  assert.equal(notice.props.pending, true)
  assert.equal(notice.props.onRetry, retrySave)
})

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
