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
test('라이선스 모달 방향·상태바·닫기', () => {
  const Screen = load('../src/diary/components/ContentLicenses.js', {
    react: { useMemo: f => f(), useState: v => [v, () => {}] }, 'react-native': { Linking: {}, Pressable: 'button', ScrollView: 'scroll', StatusBar: 'status', StyleSheet: { create: x => x }, Text: 'text', TextInput: 'input', View: 'view' },
    'react-native-safe-area-context': { SafeAreaView: 'safe' }, '../../editor/components/controls/EditorModal': { __esModule: true, default: 'modal' }, '../../shared/AppIcon': { __esModule: true, default: 'icon' }, '../../shared/dialogs': {}, '../constants': { C: {} }, '../data/contentLicenses.json': [],
    '../../licenses/softwareNotices': { __esModule: true, default: { components: [] } }, '../../licenses/sourceFiles': {},
  }).default
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
