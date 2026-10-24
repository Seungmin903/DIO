import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/panels/RecentPhotos.js', import.meta.url), 'utf8'), {
  filename: 'RecentPhotos.js', configFile: false, babelrc: false, presets: [expo.resolve('babel-preset-expo')],
})
function harness() {
  const slots = []; let cursor = 0; const added = [], removed = []
  const jsx = (type, props) => ({ type, props })
  const module = { exports: {} }
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
  }
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'react') return hooks
    if (id.includes('jsx-runtime')) return { jsx, jsxs: jsx }
    if (id === 'react-native') return { Pressable: 'button', Text: 'text', View: 'view', StyleSheet: { create: x => x } }
    if (id.includes('theme')) return { colors: {} }
    if (id.includes('ConfirmDialog')) return { __esModule: true, default: 'confirm' }
    return expo(id)
  }, module, module.exports)
  let photos = [{ id: 'a', name: 'A', mediaFileId: 'original-a' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]
  const render = () => { cursor = 0; return module.exports.default({ photos, columns: 4, onAdd: value => added.push(value), onRemove: ids => { removed.push(ids); photos = photos.filter(p => !ids.includes(p.id)) }, renderThumb: () => null }) }
  function flatten(node) { if (!node) return []; if (Array.isArray(node)) return node.flatMap(flatten); if (typeof node !== 'object') return []; return [node, ...flatten(node.props?.children)] }
  const nodes = () => flatten(render())
  const label = name => nodes().find(n => n.props?.accessibilityLabel === name)
  const button = text => nodes().find(n => n.type === 'button' && flatten(n.props.children).some(c => c.type === 'text' && [c.props.children].flat().join('') === text))
  return { nodes, label, button, added, removed, photos: () => photos, dialog: () => nodes().find(n => n.type === 'confirm') }
}
test('관리 모드에서는 체크만 하고 취소 후에도 선택을 유지한다', () => {
  const h = harness(); h.button('관리').props.onPress()
  assert.equal(h.nodes().find(n => n.props.disabled === true).props.accessibilityState.disabled, true)
  h.label('A 1 선택').props.onPress(); h.label('B 2 선택').props.onPress()
  assert.equal(h.added.length, 0)
  h.button('선택한 2개 삭제').props.onPress(); h.dialog().props.onCancel()
  assert.equal(h.photos().length, 3); assert.equal(h.label('A 1 선택').props.accessibilityState.checked, true)
  h.button('완료').props.onPress(); h.label('A 1 붙이기').props.onPress()
  assert.equal(h.added[0].mediaFileId, 'original-a')
})
test('확인한 항목만 한 번 삭제하며 빈 목록으로 반복 삭제할 수 있다', () => {
  const h = harness(); h.button('관리').props.onPress()
  h.label('A 1 선택').props.onPress(); h.label('B 2 선택').props.onPress()
  h.button('선택한 2개 삭제').props.onPress()
  const confirm = h.dialog().props.onConfirm; confirm(); confirm()
  assert.deepEqual(h.removed, [['a', 'b']]); assert.deepEqual(h.photos().map(p => p.id), ['c'])
  h.label('C 1 최근 목록에서 삭제').props.onPress(); h.dialog().props.onConfirm()
  assert.equal(h.photos().length, 0); assert.equal(h.button('관리'), undefined)
})



