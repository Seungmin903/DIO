import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { renameEditorDiary } from '../src/diary/services/renameEditorDiary.js'
const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
function hooks() {
  const slots = []; let cursor = 0
  return {
    reset() { cursor = 0 },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v }] },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
  }
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found }
  return null
}
function fixture({ fail = false } = {}) {
  const topHooks = hooks(), fieldHooks = hooks(); let currentHooks = topHooks
  const code = babel.transformSync(fs.readFileSync(new URL('../src/editor/components/chrome/TopBar.js', import.meta.url), 'utf8'), {
    configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'react') return { useState: v => currentHooks.useState(v), useRef: v => currentHooks.useRef(v) }
    if (id === 'react/jsx-runtime') return require(id)
    if (id === 'react-native') return { Pressable: 'Pressable', TextInput: 'Input', View: 'View', Text: 'Text', StyleSheet: { create: v => v }, useWindowDimensions: () => ({ width: 430 }) }
    if (id.includes('theme')) return { colors: {} }
    return { __esModule: true, default: id }
  }, module, module.exports)
  let active = { id: 'diary', title: '기존 이름', version: '1' }, server = { ...active }
  const calls = [], notices = [], pending = []
  let shouldFail = fail
  const save = title => {
    const request = renameEditorDiary({ diaryId: active.id, title,
      renameDiary: async (id, next) => {
        const expectedVersion = active.version
        calls.push({ id, title: next, expectedVersion })
        if (shouldFail) throw new Error('서버에 연결하지 못했어요.')
        if (expectedVersion !== server.version) throw new Error('DIARY_METADATA_CONFLICT')
        server = { ...server, title: next, version: String(Number(server.version) + 1) }
        await Promise.resolve()
        return server
      }, setActive: update => { active = update(active) }, notify: (...args) => notices.push(args),
    })
    pending.push(request)
    return request
  }
  currentHooks = topHooks; topHooks.reset()
  const tree = module.exports.default({ compact: true, doc: active, onRename: save, exportEnabled: false })
  const field = find(tree, n => typeof n.type === 'function' && typeof n.props.onCommit === 'function')
  assert.ok(field, 'TopBar must render a renamable title field')
  const render = () => { currentHooks = fieldHooks; fieldHooks.reset(); return field.type({ ...field.props, title: active.title }) }
  const edit = title => { render().props.onPress(); render().props.onChangeText(title); return render().props }
  return { edit, calls, notices, pending, active: () => active, fail: value => { shouldFail = value } }
}
for (const order of [['onSubmitEditing', 'onBlur'], ['onBlur', 'onSubmitEditing']]) {
  test(`${order.join(' then ')} saves once with no false failure`, async () => {
    const f = fixture(); const input = f.edit(' 바꾼 이름 ')
    for (const event of order) input[event]()
    input.onBlur()
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].expectedVersion, '1')
    assert.deepEqual(await Promise.all(f.pending), [true])
    assert.equal(f.active().title, '바꾼 이름'); assert.deepEqual(f.notices, [])
    input.onSubmitEditing(); assert.equal(f.calls.length, 1)
    const next = f.edit('두 번째 이름')
    input.onBlur(); next.onBlur(); next.onSubmitEditing()
    await Promise.all(f.pending)
    assert.equal(f.calls.length, 2); assert.equal(f.active().title, '두 번째 이름')
  })
}
test('real save failure is announced once, preserves title, and a new edit can retry', async () => {
  const f = fixture({ fail: true }); const input = f.edit('새 이름')
  input.onSubmitEditing(); input.onBlur()
  assert.deepEqual(await Promise.all(f.pending), [false])
  assert.equal(f.active().title, '기존 이름')
  assert.deepEqual(f.notices, [['이름을 바꾸지 못했어요', '서버에 연결하지 못했어요.']])
  f.fail(false); const retry = f.edit('새 이름'); retry.onBlur(); retry.onSubmitEditing()
  await Promise.all(f.pending); assert.equal(f.active().title, '새 이름'); assert.equal(f.calls.length, 2)
})
for (const title of ['', '   ', ' 기존 이름 ']) test(`unchanged or empty title ${JSON.stringify(title)} does not save`, () => {
  const f = fixture(), input = f.edit(title); input.onBlur(); input.onSubmitEditing(); assert.equal(f.calls.length, 0)
})
test('late successful save does not overwrite another active diary', async () => {
  let active = { id: 'other', title: '다른 다이어리' }
  assert.equal(await renameEditorDiary({ diaryId: 'first', title: '새 이름', renameDiary: async () => ({ version: '2' }), setActive: fn => { active = fn(active) }, notify: () => assert.fail('unexpected failure') }), true)
  assert.deepEqual(active, { id: 'other', title: '다른 다이어리' })
})
test('missing diary does not attempt save', async () => {
  assert.equal(await renameEditorDiary({ renameDiary: () => assert.fail('unexpected request') }), false)
})

