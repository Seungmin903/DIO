import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { PROMPTS } from '../src/handwriting/protocol.js'
import { manuscriptLayout } from '../src/handwriting/manuscriptLayout.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
function harness(component = 'DrawingPad') {
  const file = component === 'DrawingPad' ? 'DrawingPad' : 'HandwritingStudio'
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL(`../src/handwriting/${file}.js`, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const slots = [], pending = [], listeners = new Set()
  let cursor = 0
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value }] },
    useRef(current) { return slots[cursor++] ??= { current } },
    useCallback: fn => fn,
    useSyncExternalStore: (_subscribe, get) => get(),
    useEffect(fn, deps) {
      const i = cursor++, previous = slots[i]
      if (previous && deps.every((d, j) => Object.is(d, previous.deps[j]))) return
      slots[i] = { deps }
      pending.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn() })
    },
  }
  const mod = { exports: {} }
  const load = id => {
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return require(id)
    if (id === 'react-native') return {
      View: 'View', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable',
      StyleSheet: { create: x => x }, useWindowDimensions: () => ({ width: 390, height: 844 }),
      AppState: { addEventListener(_event, listener) { listeners.add(listener); return { remove() { listeners.delete(listener) } } } },
    }
    if (id === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }
    if (id === 'react-native-svg') return { default: 'Svg', Circle: 'Circle', Path: 'Path' }
    if (id.endsWith('/theme')) return { colors: {}, radius: {}, DISABLED_OPACITY: 0.4 }
    if (id === './DrawingPad') return { __esModule: true, default: 'DrawingPad' }
    if (id === './protocol.js') return { PROMPTS, SYLLABLE_COUNT: 11172, validateDraft() {} }
    if (id === './manuscriptLayout.js') return { manuscriptLayout }
    if (id === './studioBus.js') return { setStudioCloseGuard: () => () => {} }
    return {}
  }
  new Function('require', 'module', 'exports', code + `\nmodule.exports.testComponent = ${component};`)(load, mod, mod.exports)
  return {
    render(props = {}) {
      cursor = 0
      const tree = mod.exports.testComponent(props)
      if (component !== 'StudioContent') pending.splice(0).forEach(fn => fn())
      return tree
    },
    background() { listeners.forEach(fn => fn('background')) },
    unmount() { slots.forEach(slot => slot.cleanup?.()) },
  }
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found }
  return null
}
function findAll(node, predicate, result = []) {
  if (!node || typeof node !== 'object') return result
  if (predicate(node)) result.push(node)
  for (const child of [node.props?.children].flat(Infinity)) findAll(child, predicate, result)
  return result
}
const event = (x = 60, y = 80, touches = [{}]) => ({ nativeEvent: { locationX: x, locationY: y, touches, pointerType: 'pen', pressure: .6 } })
function pad() {
  const h = harness(), activity = [], saved = []
  const props = { character: '값', width: 9, onChange: s => saved.push(s), onInputActiveChange: a => activity.push(a) }
  return { ...h, activity, saved, input: patch => find(h.render({ ...props, ...patch }), n => n.props?.accessibilityLabel?.endsWith('손글씨 입력칸')).props }
}

test('필기 responder를 얻으면 잠그고 획 종료에서 한 번만 저장·해제한다', () => {
  const h = pad(), input = h.input()
  input.onTouchStart(event()); assert.deepEqual(h.activity, [])
  input.onResponderGrant(event()); input.onResponderMove(event(80, 180))
  assert.equal(input.onResponderTerminationRequest(), false)
  assert.equal(input.onShouldBlockNativeResponder(), true)
  input.onTouchEnd(event(80, 180, [])); input.onResponderRelease()
  assert.deepEqual(h.activity, [true, false]); assert.equal(h.saved.length, 1)
  assert.equal(h.saved[0].strokes[0].points.length, 2)
})
test('취소·멀티터치·백그라운드·글자 변경·비활성화·닫기는 미완료 획과 잠금을 정리한다', () => {
  for (const stop of ['cancel', 'terminate', 'multitouch', 'background', 'character', 'disabled', 'unmount']) {
    const h = pad(), input = h.input(); input.onResponderGrant(event())
    if (stop === 'cancel') input.onTouchCancel()
    if (stop === 'terminate') input.onResponderTerminate()
    if (stop === 'multitouch') input.onTouchStart(event(10, 10, [{}, {}]))
    if (stop === 'background') h.background()
    if (stop === 'character') h.input({ character: '같' })
    if (stop === 'disabled') h.input({ disabled: true })
    if (stop === 'unmount') h.unmount()
    input.onResponderRelease()
    assert.deepEqual(h.activity, [true, false], stop); assert.deepEqual(h.saved, [], stop)
    h.unmount()
  }
})
test('입력 화면을 거친 필기 상태가 실제 상위 ScrollView를 즉시 잠그고 다시 푼다', async () => {
  for (const stop of ['release', 'cancel', 'terminate', 'background', 'unmount']) {
    const parent = harness('StudioContent'), child = harness('InputScreen'), drawing = harness()
    const snapshot = { loaded: true, error: '', support: { available: false }, entries: [{ id: 'draft', name: '테스트', status: 'draft', draft: { schema: 1, id: 'ink', samples: {} } }] }
    const controller = { subscribe() {}, getSnapshot: () => snapshot, saveDraft: async () => {} }
    const renderParent = () => parent.render({ controller })
    await find(renderParent(), n => n.props?.accessibilityLabel === '테스트 작성 중').props.onPress()
    let tree = renderParent()
    const scroll = () => find(tree = renderParent(), n => n.type === 'ScrollView').props
    const nativeProps = []
    scroll().ref.current = { setNativeProps: patch => nativeProps.push(patch) }
    const inputScreen = find(tree, n => n.type?.name === 'InputScreen')
    const drawingProps = find(child.render(inputScreen.props), n => n.type === 'DrawingPad').props
    const input = find(drawing.render(drawingProps), n => n.props?.accessibilityLabel?.endsWith('손글씨 입력칸')).props
    input.onResponderGrant(event())
    assert.deepEqual(nativeProps, [{ scrollEnabled: false }], 'native lock must happen before a React render')
    assert.equal(scroll().scrollEnabled, false)
    assert.equal(scroll().canCancelContentTouches, false)
    if (stop === 'release') input.onResponderRelease()
    if (stop === 'cancel') input.onTouchCancel()
    if (stop === 'terminate') input.onResponderTerminate()
    if (stop === 'background') drawing.background()
    if (stop === 'unmount') drawing.unmount()
    assert.deepEqual(nativeProps.at(-1), { scrollEnabled: true }, stop)
    assert.equal(scroll().scrollEnabled, true, stop)
    assert.equal(scroll().canCancelContentTouches, true, stop)
    drawing.unmount(); child.unmount()
  }
})
test('원고지의 36칸은 한 칸만 입력을 소유하고 빠른 다음 칸 입력도 이전 글씨를 보존한다', () => {
  const child = harness('InputScreen'), first = harness(), second = harness(), activity = [], saved = []
  const props = { workflow: { saveDraft: async (_id, draft) => saved.push(draft) }, value: { id: 'font', name: '테스트', draft: { schema: 1, id: 'draft', samples: {} } }, narrow: true, busy: '', support: { available: false }, inputSave: { current: null }, onInputActiveChange: value => activity.push(value) }
  let tree = child.render(props)
  assert.equal(find(tree, n => n.props?.testID === 'handwriting-input-row'), null)
  const pads = findAll(tree, n => n.type === 'DrawingPad')
  assert.equal(pads.length, 36)
  const input = h => find(h, n => n.props?.accessibilityLabel?.endsWith('손글씨 입력칸')).props
  const a = input(first.render(pads[0].props)), b = input(second.render(pads[1].props))
  const cell = find(tree, n => n.props?.testID === 'handwriting-manuscript-cell')
  first.render(pads[0].props).props.onLayout({ nativeEvent: { layout: { width: Object.assign({}, ...cell.props.style).width - 1 } } })
  const guide = find(first.render(pads[0].props), n => n.type === 'Text' && n.props?.children === PROMPTS[0])
  assert.equal(guide.props.allowFontScaling, false)
  assert.equal(Object.assign({}, ...guide.props.style).fontSize * 2, Object.assign({}, ...cell.props.style).width - 1)
  a.onResponderGrant(event())
  assert.deepEqual(activity, [true])
  assert.equal(b.onStartShouldSetResponder(), false, 'block the second cell before React re-renders')
  b.onResponderGrant(event()); assert.deepEqual(activity, [true])
  tree = child.render(props)
  const lockedPads = findAll(tree, n => n.type === 'DrawingPad')
  assert.equal(lockedPads[0].props.disabled, false); assert.equal(lockedPads[1].props.disabled, true)
  a.onResponderRelease()
  assert.equal(b.onStartShouldSetResponder(), true)
  b.onResponderGrant(event()); b.onResponderRelease()
  assert.deepEqual(activity, [true, false, true, false])
  assert.equal(saved.length, 2)
  assert.deepEqual(Object.keys(saved.at(-1).samples), PROMPTS.slice(0, 2))
  const buttons = findAll(child.render(props), n => n.type?.name === 'Button' && n.props.label?.startsWith('펜 굵기'))
  assert.deepEqual(buttons.map(n => n.props.children), ['얇게', '중간', '두껍게'])
  assert.equal(buttons[1].props.primary, true)
  first.unmount(); second.unmount(); child.unmount()
})

test('원고지 칸은 화면 안에 모두 들어오며 가로 공간이 부족하면 다음 행을 만든다', () => {
  for (const [width, height] of [[254,510], [324,520], [780,160], [958,520], [1036,520]]) {
    const layout = manuscriptLayout(width, height)
    assert.ok(layout.width <= width + .001)
    assert.ok(layout.height <= height + .001)
    assert.ok(layout.rows * layout.columns >= 36)
    assert.ok(layout.rows > 1)
    assert.ok(layout.cell <= 100)
  }
})
