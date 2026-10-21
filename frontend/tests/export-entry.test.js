import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
function components(file, isPhone = true, height = 390) {
  const { code } = babel.transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const module = { exports: {} }
  const load = id => {
    if (id.endsWith('/useFormFactor')) return { useFormFactor: () => ({ isPhone }) }
    if (id === 'react') return { useRef: current => ({ current }), useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], Fragment: Symbol.for('react.fragment') }
    if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 21, left: 0, right: 0 }) }
    if (id === 'react-native') return { ScrollView: 'scroll', useWindowDimensions: () => ({ width: 844, height }), Modal: 'modal', Pressable: 'pressable', ScrollView: 'scroll', Text: 'text', View: 'view', TextInput: 'input', StyleSheet: { create: v => v } }
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
    const toolbar = labels(phone.default({ exportEnabled }))
    const top = labels(tablet.default({ doc: { title: '일기' }, readOnly, exportEnabled, shareLabel: '공유 및 내보내기' }))
    assert.equal(rail.includes('내보내기'), exportEnabled)
    assert.equal(toolbar.includes('내보내기'), false)
    assert.equal(top.includes('공유 및 내보내기'), exportEnabled)
    assert.ok(rail.includes('페이지 목록'))
    assert.ok(rail.includes('집중 편집'))
    assert.ok(toolbar.includes('손바닥 (화면 이동)'))
    assert.ok(toolbar.includes('사진·GIF'))
    assert.ok(toolbar.includes('마스킹테이프'))
    assert.ok(toolbar.includes('격자 가이드'))
    assert.ok(!toolbar.includes('집중 편집'))
    assert.ok(!toolbar.includes('추가 도구'))
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
  assert.deepEqual(bindings, ['exportEnabled', 'exportEnabled'])
  // 정책 결정으로 내보내기를 다시 켰다 (숨김 여부는 이 값 하나로 정한다)
  assert.equal(policy, true)
  assert.ok(handler)
  for (const enabled of [false, true]) {
    const events = []
    const fn = new Function('exportEnabled', 'textEditing', 'cropId', 'tapeCropId', 'showToast', 'Keyboard', 'setExportOpen', `return (${source.slice(handler.start, handler.end)})`)(
      enabled, null, null, null, () => events.push(['toast']), { dismiss: () => events.push(['keyboard']) }, value => events.push(['export', value]),
    )
    fn()
    assert.deepEqual(events, enabled ? [['keyboard'], ['export', true]] : [])
  }
})


test('폰 세로 내보내기는 상단 바 맨 오른쪽에 하나만 표시하고 같은 핸들러를 호출한다', () => {
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  for (const readOnly of [false, true]) for (const exportEnabled of [false, true]) {
    let opened = 0
    const tree = tablet.default({ compact: true, doc: {title:'일기'}, readOnly, exportEnabled, shareLabel:'공유 및 내보내기', onShare:()=>opened++ })
    const buttons = nodes(tree).filter(node => node.props?.accessibilityLabel === '공유 및 내보내기')
    assert.equal(buttons.length, exportEnabled ? 1 : 0)
    if (exportEnabled) {
      assert.equal(labels(tree).at(-1), '공유 및 내보내기')
      buttons[0].props.onPress()
      assert.equal(opened, 1)
    }
    assert.equal(labels(phone.default({exportEnabled})).includes('내보내기'), false)
    assert.equal(labels(phone.PhoneEditorRail({readOnly,exportEnabled})).includes('내보내기'),exportEnabled)
  }
})


test('편집기 모달은 공통 방향 정책을 사용하며 새 직접 사용도 검출한다', () => {
  const root = new URL('../src/editor/', import.meta.url)
  const files = readdirSync(root, { recursive: true }).filter(file => file.endsWith('.js'))
  const consumers = []
  for (const file of files) {
    const source = readFileSync(new URL(file.replaceAll('\\', '/'), root), 'utf8')
    const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } })
    babel.traverse(ast, {
      ImportDeclaration(path) {
        if (path.node.source.value !== 'react-native') return
        for (const specifier of path.node.specifiers) if (specifier.imported?.name === 'Modal') assert.ok(file.endsWith('EditorModal.js'), `${file}: 공통 모달 사용 필요`)
      },
      JSXOpeningElement(path) {
        if (path.node.name.name === 'EditorModal') consumers.push(file.replaceAll('\\', '/'))
      },
    })
  }
  for (const name of ['ExportMenu.js', 'ExportScreen.js', 'TextLinkDialog.js', 'controls/ConfirmDialog.js', 'panels/PhotoCropper.js', 'panels/TapeCropper.js', 'panels/PageOverview.js']) assert.ok(consumers.includes(`components/${name}`), name)
  const Modal = components('../src/editor/components/controls/EditorModal.js').default
  let closed = 0
  const modal = Modal({ visible: true, children: 'content', onRequestClose: () => closed++ })
  assert.equal(modal.type, 'modal')
  assert.deepEqual(modal.props.supportedOrientations, ['portrait', 'landscape'])
  assert.equal(modal.props.visible, true)
  assert.equal(modal.props.children, 'content')
  modal.props.onRequestClose()
  assert.equal(closed, 1)
  const TabletModal = components('../src/editor/components/controls/EditorModal.js', false).default
  const tablet = TabletModal({ visible: true, children: 'content' })
  // iOS Modal 기본값(세로 전용)으로는 가로 고정 태블릿에서 앱이 종료되므로 태블릿도 두 방향을 지정한다.
  assert.deepEqual(tablet.props.supportedOrientations, ['portrait', 'landscape'])
  assert.equal(tablet.props.visible, true)
  assert.equal(tablet.props.children, 'content')
})

test('모바일 자르기 창은 안전 영역 안에서 스크롤되고 태블릿은 기존 카드 그대로 반환한다', () => {
  const child = { type: 'card', props: { children: 'apply' } }
  for (const height of [320, 390, 844]) {
    const Viewport = components('../src/editor/components/controls/CropViewport.js', true, height).default
    const tree = Viewport({ children: child })
    assert.equal(tree.type, 'scroll')
    assert.equal(tree.props.style.maxHeight, height - 42 - 24)
    assert.equal(tree.props.style.flexGrow, 0)
    assert.equal(tree.props.children, child)
  }
  const TabletViewport = components('../src/editor/components/controls/CropViewport.js', false).default
  assert.equal(TabletViewport({ children: child }), child)
})
