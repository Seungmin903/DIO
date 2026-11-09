import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
function load(file, mocks) {
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] })
  const m = { exports: {} }; new Function('require', 'module', 'exports', code)(id => id in mocks ? mocks[id] : require(id), m, m.exports); return m.exports
}
const all = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(all)]
function loadLicenses(components, size) { return loadModule(components, size).default }
function loadModule(components, size = { width: 400, height: 800 }) {
  return load('../src/diary/components/ContentLicenses.js', {
    react: { useMemo: f => f(), useState: v => [v, () => {}] }, 'react-native': { FlatList: 'list', Linking: {}, Platform: { select: o => o.default }, Pressable: 'button', ScrollView: 'scroll', StatusBar: 'status', StyleSheet: { create: x => x }, Text: 'text', TextInput: 'input', View: 'view', useWindowDimensions: () => size },
    'react-native-safe-area-context': { SafeAreaView: 'safe' }, '../../editor/components/controls/EditorModal': { __esModule: true, default: 'modal' }, '../../editor/components/controls/Icon': { __esModule: true, default: 'editor-icon' }, '../../shared/AppIcon': { __esModule: true, default: 'icon' },
    '../../shared/dialogs': {}, '../../shared/theme': { colors: {}, radius: {} }, './BackButton': { __esModule: true, default: 'back' }, './EmptyState': { __esModule: true, default: 'empty' }, '../data/contentLicenses.json': [],
    '../../licenses/softwareNotices': { __esModule: true, default: { components } }, '../../licenses/sourceFiles': {},
  })
}
test('596: 전문의 생성기 표시 줄(--- LICENSE ---)은 지우고, 묶음 항목만 "라이브러리 (파일)" 이름을 소제목으로 남긴다', () => {
  const { legalSections } = loadModule([])
  assert.deepEqual(legalSections('--- LICENSE ---\nMIT License\n\nCopyright (c) 2020 Expo'), [{ label: '', body: 'MIT License\n\nCopyright (c) 2020 Expo' }])
  assert.deepEqual(legalSections('--- Source copyright header 1 ---\n/* (c) Meta */\n\n--- MIT license ---\nMIT License').map(s => s.label), ['', ''])
  const skia = legalSections('--- Skia (skia-LICENSE.txt) ---\nBSD\n\n\n\n--- HarfBuzz (skia-harfbuzz-COPYING.txt) ---\nOld MIT\n--- end of FTL.TXT ---')
  assert.deepEqual(skia.map(s => s.label), ['Skia (skia-LICENSE.txt)', 'HarfBuzz (skia-harfbuzz-COPYING.txt)'])
  assert.equal(skia[0].body, 'BSD')
  assert.equal(skia[1].body, 'Old MIT\n--- end of FTL.TXT ---', '원문 마지막 줄은 남긴다')
  // 원문 안의 긴 대시 구분선은 그대로
  assert.equal(legalSections('a\n-----------------------------\nb')[0].body, 'a\n-----------------------------\nb')
})
test('596: 카드 없이 이름 순 한 줄 목록 → 누르면 상세, 태블릿 가로는 목록 · 상세 나란히', () => {
  const entry = (id, name, license, version) => ({ id, name, license, version, text: 'MIT License' })
  const components = [entry('z', 'Zstandard', 'BSD-3-Clause', '1.5.7'), entry('l', 'libavif', 'BSD-2-Clause', '1.3'), entry('a', '@expo/cli', 'MIT', '58.1.15'), entry('p', 'Pretendard', 'OFL-1.1', 'bundled font files')]
  const phone = loadLicenses(components)({ visible: true, onClose() {} })
  const list = all(phone).find(n => n.type === 'list')
  assert.deepEqual(list.props.data.map(e => e.name), ['@expo/cli', 'libavif', 'Pretendard', 'Zstandard'])
  const row = list.props.renderItem({ item: list.props.data[2] })
  assert.equal(row.props.accessibilityLabel, 'Pretendard 라이선스 전문 보기')
  // 숫자 없는 버전('bundled font files')은 보조 줄에 쓰지 않는다
  assert.ok(all(row).some(n => n.type === 'text' && n.props.children === 'OFL-1.1'))
  assert.equal(all(phone).find(n => n.type === 'back').props.label, '라이선스 화면 닫기')
  const tablet = loadLicenses(components, { width: 1280, height: 800 })({ visible: true, onClose() {} })
  assert.ok(all(tablet).some(n => n.type === 'list'))
  assert.ok(all(tablet).some(n => n.props?.entry?.name === '@expo/cli' && n.props.wide), '넓은 창은 첫 항목 상세를 옆에 연다')
})
test('라이선스 모달 방향·상태바·닫기', () => {
  const Screen = loadLicenses([])
  let closed = false; const t = Screen({ visible: true, onClose: () => { closed = true } })
  assert.equal(t.type, 'modal'); assert.deepEqual(t.props.supportedOrientations, ['portrait', 'landscape']); assert.equal(t.props.statusBarTranslucent, true)
  assert.equal(all(t).find(n => n.type === 'status').props.hidden, true); t.props.onRequestClose(); assert.ok(closed)
  assert.ok(!all(Screen({ visible: false })).some(n => n.type === 'status'))
})
test('출처 순서·숨김을 저장하고 앱 재시작 후 복원·숨김 해제', async () => {
  const disk = new Map()
  const storage = load('../src/editor/services/storage.js', { './documentStorage': { __esModule: true, default: { getItem: async k => disk.get(k) ?? null, setItem: async (k,v) => { disk.set(k,v) } } }, '../utils/storageContract.js': { STORAGE_KEYS: { customDecor: 'dio:editor:custom-decor:v2' } } })
  function mount() {
    let states = [], deps = [], cursor = 0, effects = []
    const react = { useCallback: f => f, useState: v => { const i = cursor++; if (!(i in states)) states[i] = typeof v === 'function' ? v() : v; return [states[i], n => { states[i] = typeof n === 'function' ? n(states[i]) : n }] }, useEffect: (fn,next) => { const i = cursor++; if (!deps[i] || next.some((v,k) => !Object.is(v,deps[i][k]))) { effects.push(fn); deps[i] = next } } }
    const hook = load('../src/editor/hooks/useCustomDecor.js', { react, '../utils/common': { createId: () => 'id' }, '../services/mediaStore': { hydrateMedia: async () => {} }, '../utils/mediaReferences.js': { mediaId: () => null }, '../services/storage': storage }).useCustomDecor
    return async () => { cursor = 0; const result = hook(), pending = effects; effects = []; pending.forEach(fn => fn()); await new Promise(r => setImmediate(r)); return result }
  }
  const render = mount(); await render(); let r = await render(); const order = ['twemoji','fluent-emoji','motion']
  r.setCategoryOrder(order); r.toggleHidden('fluent-emoji'); await render()
  const stored = JSON.parse(disk.get('dio:editor:custom-decor:v2')); assert.deepEqual(stored.categoryOrder,order); assert.deepEqual(stored.hiddenCategories,['fluent-emoji'])
  const restart = mount(); await restart(); r = await restart(); assert.deepEqual(r.items.categoryOrder,order); assert.deepEqual(r.items.hiddenCategories,['fluent-emoji'])
  r.toggleHidden('fluent-emoji'); await restart(); assert.deepEqual(JSON.parse(disk.get('dio:editor:custom-decor:v2')).hiddenCategories,[])
})

test('실제 EditorModal을 거쳐도 폰·태블릿 모두 방향·상태바·닫기 props를 유지한다', () => {
  for (const isPhone of [true, false]) {
    const Modal = load('../src/editor/components/controls/EditorModal.js', {
      'react-native': { Modal: 'native-modal' },
      '../../../shared/useFormFactor': { useFormFactor: () => ({ isPhone }) },
    }).default
    const close = () => {}
    const tree = Modal({ visible: true, supportedOrientations: ['portrait', 'landscape'], statusBarTranslucent: true, onRequestClose: close })
    assert.equal(tree.type, 'native-modal')
    assert.deepEqual(tree.props.supportedOrientations, ['portrait', 'landscape'])
    assert.equal(tree.props.statusBarTranslucent, true)
    assert.equal(tree.props.onRequestClose, close)
  }
})
