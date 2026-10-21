import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
function components(file) {
  const { code } = babel.transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const module = { exports: {} }
  const load = id => {
    if (id === 'react') return { useRef: current => ({ current }), useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], Fragment: Symbol.for('react.fragment') }
    if (id === 'react-native') return { Pressable: 'pressable', ScrollView: 'scroll', Text: 'text', View: 'view', TextInput: 'input', StyleSheet: { create: v => v } }
    if (id.endsWith('/theme')) return { colors: {}, shadow: {} }
    if (id.startsWith('.')) return { __esModule: true, default: () => null }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  return module.exports
}
function labels(tree) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(labels)
  const p = tree.props ?? {}
  return [p.label, p.accessibilityLabel, ...labels(p.children)].filter(Boolean)
}
const phone = components('../src/editor/components/chrome/PhoneToolbar.js')
const tablet = components('../src/editor/components/chrome/TopBar.js')

for (const readOnly of [false, true]) test(`공통 표시 설정으로 태블릿·폰 가로·폰 세로에서 내보내기를 숨긴다 (readOnly=${readOnly})`, () => {
  for (const exportEnabled of [false, true]) {
    const rail = labels(phone.PhoneEditorRail({ readOnly, exportEnabled }))
    const more = labels(phone.PhoneMoreTools({ exportEnabled }))
    const top = labels(tablet.default({ doc: { title: '일기' }, readOnly, exportEnabled, shareLabel: '공유 및 내보내기' }))
    assert.equal(rail.includes('내보내기'), exportEnabled)
    assert.equal(more.includes('내보내기'), exportEnabled)
    assert.equal(top.includes('공유 및 내보내기'), exportEnabled)
    assert.ok(rail.includes('페이지 목록'))
    assert.ok(rail.includes('집중 편집'))
    assert.ok(more.includes('사진·GIF'))
    assert.ok(more.includes('테이프'))
  }
})

test('공통 openExport 핸들러는 비활성일 때 직접 호출해도 메뉴·키보드·시트 상태를 바꾸지 않는다', () => {
  const source = readFileSync(new URL('../src/editor/screens/EditorScreen.js', import.meta.url), 'utf8')
  const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } })
  let handler, policy
  const bindings = []
  babel.traverse(ast, {
    VariableDeclarator(path) {
      if (path.node.id.name === 'openExport') handler = path.node.init
      if (path.node.id.name === 'exportEnabled') policy = path.node.init.value
    },
    JSXAttribute(path) {
      if (path.node.name.name === 'exportEnabled') bindings.push(path.node.value.expression.name)
    },
  })
  assert.deepEqual(bindings, ['exportEnabled', 'exportEnabled', 'exportEnabled'])
  assert.equal(policy, false)
  assert.ok(handler)
  for (const enabled of [false, true]) {
    const events = []
    const fn = new Function('exportEnabled', 'setPhoneMoreOpen', 'textEditing', 'cropId', 'tapeCropId', 'showToast', 'Keyboard', 'setExportOpen', `return (${source.slice(handler.start, handler.end)})`)(
      enabled, value => events.push(['more', value]), null, null, null, () => events.push(['toast']), { dismiss: () => events.push(['keyboard']) }, value => events.push(['export', value]),
    )
    fn()
    assert.deepEqual(events, enabled ? [['more', false], ['keyboard'], ['export', true]] : [])
  }
})
