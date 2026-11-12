import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { PROMPTS } from '../src/handwriting/protocol.js'
import { isEmptyDraft, listStatus, statusText } from '../src/handwriting/workflow.js'
import {createDraftAutosave} from '../src/handwriting/draftAutosave.js'
import * as inkPreview from '../src/handwriting/inkPreview.js'
import { manuscriptLayout } from '../src/handwriting/manuscriptLayout.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
function harness(component = 'DrawingPad') {
  const file = component === 'DrawingPad' ? 'DrawingPad' : 'HandwritingStudio'
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL(`../src/handwriting/${file}.js`, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const slots = [], pending = [], listeners = new Set(), guards = [], closed = []
  let cursor = 0
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value }] },
    useRef(current) { return slots[cursor++] ??= { current } },
    useCallback: fn => fn,
    useMemo(fn) { cursor++; return fn() },
    memo: component => component,
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
    if (id.endsWith('/useFillGrid')) return { __esModule: true, default: ({ cell, gap }) => ({ onLayout() {}, columns: 1, cellWidth: cell, spreadGap: gap }) }
    if (id === './draftAutosave.js') return {createDraftAutosave}
    if (id === './inkPreview.js') return inkPreview
    if (id === './DrawingPad') return { __esModule: true, default: 'DrawingPad' }
    if (id === './protocol.js') return { PROMPTS, SYLLABLE_COUNT: 11172, validateDraft() {} }
    if (id === './manuscriptLayout.js') return { manuscriptLayout }
    if (id === './library.js') return { refreshPersonalFonts: async () => [] }
    if (id === './workflow.js') return { statusText, listStatus, isEmptyDraft, queuePosition: () => 1, completedCount: () => 0 }
    if (id === './studioBus.js') return { setStudioCloseGuard: guard => { guards.push(guard); return () => {} }, closeFontStudio: async () => { closed.push(1) } }
    if (id.endsWith('/controls/Slider')) return { __esModule: true, default: 'Slider' }
    if (id.endsWith('/MakerKit')) return { MakerHeader: 'MakerHeader', MakerBar: 'MakerBar', MakerSegment: 'Segment', MakerSegmentItem: 'SegmentItem', MakerSteps: 'Steps', MakerNav: 'Nav' }
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
    guards, closed,
    flush() { pending.splice(0).forEach(fn => fn()) },
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
    await find(renderParent(), n => n.props?.accessibilityLabel === '테스트 0 / 36 작성 중').props.onPress()
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
test('원고지의 36칸은 한 칸만 입력을 소유하고 빠른 다음 칸 입력도 이전 글씨를 보존한다', async () => {
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
  assert.equal(lockedPads[0].props.disabled, false); assert.equal(lockedPads[1].props.disabled, false); assert.equal(lockedPads[1].props.canStartInput(), false)
  a.onResponderRelease()
  assert.equal(b.onStartShouldSetResponder(), true)
  b.onResponderGrant(event()); b.onResponderRelease()
  assert.deepEqual(activity, [true, false, true, false])
  assert.equal(saved.length, 0)
  await props.inputSave.current()
  assert.equal(saved.length, 1)
  assert.deepEqual(Object.keys(saved.at(-1).samples), PROMPTS.slice(0, 2))
  // 펜 굵기는 편집창 펜과 같은 막대(6 ~ 24, 처음 9). 끌어서 생긴 소수는 정수로 맞춰 다음 획에 쓴다. 이름 입력은 이 단계에 없다(샘플 확인에서 정한다)
  const slider = () => find(child.render(props), n => n.type === 'Slider').props
  assert.deepEqual([slider().label, slider().min, slider().max, slider().value], ['펜 굵기', 6, 24, 9])
  slider().onChange(11.4)
  assert.equal(slider().value, 11)
  assert.equal(findAll(child.render(props), n => n.type === 'DrawingPad')[0].props.width, 11)
  // 획 되돌리기 ↔ 다시 실행: 지금 칸(두 번째 글자)의 마지막 획을 빼고 다시 넣는다. 새 획을 쓰면 다시 실행 기록은 비운다
  const button = label => find(child.render(props), n => n.props?.label === label).props
  assert.equal(button('획 다시 실행').disabled, true)
  button('획 되돌리기').onPress(); await props.inputSave.current()
  assert.equal(saved.at(-1).samples[PROMPTS[1]], undefined)
  assert.equal(button('획 다시 실행').disabled, false)
  button('획 다시 실행').onPress(); await props.inputSave.current()
  assert.equal(saved.at(-1).samples[PROMPTS[1]].strokes.length, 1)
  assert.equal(button('획 다시 실행').disabled, true)
  button('획 되돌리기').onPress(); await props.inputSave.current(); assert.equal(button('획 다시 실행').disabled, false)
  const again = input(second.render(findAll(child.render(props), n => n.type === 'DrawingPad')[1].props))
  again.onResponderGrant(event()); again.onResponderRelease()
  assert.equal(button('획 다시 실행').disabled, true)
  assert.equal(find(child.render(props), n => n.props?.accessibilityLabel === '새 폰트 이름'), null)
  first.unmount(); second.unmount(); child.unmount()
})

test('샘플 확인은 하단 바에서 열고, 폰트 이름은 샘플 확인 단계에서 정해 생성 확정 전에 저장한다', async () => {
  const parent = harness('StudioContent'), calls = []
  const snapshot = { loaded: true, error: '', support: { available: true }, entries: [{ id: 'draft', name: '나의 손글씨', status: 'draft', draft: { schema: 1, id: 'ink', samples: {} } }] }
  const controller = { subscribe() {}, getSnapshot: () => snapshot, saveDraft: async () => {}, preview: async id => calls.push(['preview', id]),
    rename: async (id, name) => calls.push(['rename', id, name]), confirm: async id => calls.push(['confirm', id]) }
  const render = () => parent.render({ controller })
  await find(render(), n => n.props?.accessibilityLabel === '나의 손글씨 0 / 36 작성 중').props.onPress()
  assert.equal(find(render(), n => n.type === 'Steps').props.current, 'input')
  const screen = find(render(), n => n.type?.name === 'InputScreen')
  screen.props.onBar({ count: 36, status: '이 기기에 저장됨', disabled: false })
  const bar = () => find(render(), n => n.type === 'MakerBar')
  const sample = find(bar(), n => n.type?.name === 'Button')
  assert.equal(sample.props.children, '샘플 확인'); assert.equal(sample.props.disabled, false)
  await sample.props.onPress()
  assert.equal(find(render(), n => n.type === 'Steps').props.current, 'preview')
  assert.equal(find(render(), n => n.type?.name === 'Button' && n.props.children === '입력 수정'), null)
  // 손글씨 입력으로는 하단 `이전` · 단계 표시의 지난 단계로 돌아간다(헤더 < 는 목록으로 나가기)
  assert.equal(typeof find(bar(), n => n.type === 'Nav').props.onPrev, 'function')
  assert.equal(typeof find(render(), n => n.type === 'Steps').props.onStep, 'function')
  const name = () => find(render(), n => n.props?.accessibilityLabel === '새 폰트 이름').props
  assert.equal(name().value, '나의 손글씨')
  name().onChangeText(' ')
  assert.equal(find(bar(), n => n.type?.name === 'Button').props.disabled, true)
  name().onChangeText('일기 글씨')
  await find(bar(), n => n.type?.name === 'Button' && n.props.children === '생성 확정').props.onPress()
  assert.deepEqual(calls, [['preview', 'draft'], ['rename', 'draft', '일기 글씨'], ['confirm', 'draft']])
})

test('이름이 다른 폰트와 겹쳐 저장에 실패하면 생성 확정과 화면 이동을 하지 않고 샘플 확인에 오류를 보인다', async () => {
  const parent = harness('StudioContent'), calls = []
  const snapshot = { loaded: true, error: '', support: { available: true }, entries: [{ id: 'draft', name: '나의 손글씨', status: 'draft', draft: { schema: 1, id: 'ink', samples: {} } }] }
  const controller = { subscribe() {}, getSnapshot: () => snapshot, saveDraft: async () => {}, preview: async id => calls.push(['preview', id]),
    rename: async () => { calls.push(['rename']); throw new Error('같은 이름의 폰트가 있어요.') }, confirm: async id => calls.push(['confirm', id]) }
  const render = () => parent.render({ controller })
  await find(render(), n => n.props?.accessibilityLabel === '나의 손글씨 0 / 36 작성 중').props.onPress()
  find(render(), n => n.type?.name === 'InputScreen').props.onBar({ count: 36, status: '이 기기에 저장됨', disabled: false })
  await find(find(render(), n => n.type === 'MakerBar'), n => n.type?.name === 'Button').props.onPress()
  find(render(), n => n.props?.accessibilityLabel === '새 폰트 이름').props.onChangeText('이미 있는 이름')
  await find(find(render(), n => n.type === 'MakerBar'), n => n.type?.name === 'Button' && n.props.children === '생성 확정').props.onPress()
  assert.deepEqual(calls, [['preview', 'draft'], ['rename']], '이름 저장이 실패하면 confirm 을 부르지 않는다')
  assert.equal(find(render(), n => n.type === 'Steps').props.current, 'preview', '샘플 확인 단계에 남는다')
  assert.equal(find(render(), n => n.props?.accessibilityRole === 'alert').props.children, '같은 이름의 폰트가 있어요.')
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

test('공방에서 열면(create · open) 자체 목록을 건너뛰고 새 폰트 입력 · 고른 폰트 화면으로 바로 들어간다', async () => {
  const tick = () => new Promise(resolve => setImmediate(resolve))
  const entries = [{ id: 'draft', name: '테스트', status: 'draft', draft: { schema: 1, id: 'ink', samples: {} } }]
  const snapshot = { loaded: true, error: '', support: { available: false }, entries }
  const created = []
  const controller = { subscribe() {}, getSnapshot: () => snapshot, saveDraft: async () => {}, create: async () => { created.push(1); entries.push({ id: 'fresh', name: '새 폰트', status: 'draft', draft: { schema: 1, id: 'ink2', samples: {} } }); return 'fresh' } }
  const hasHome = tree => Boolean(find(tree, n => n.props?.children === '+ 새로 만들기' || n.props?.label === '+ 새로 만들기'))
  const hasInput = tree => Boolean(find(tree, n => n.type?.name === 'InputScreen'))

  const make = harness('StudioContent')
  assert.equal(hasHome(make.render({ options: { create: true }, controller })), false)
  make.flush(); await tick()
  assert.deepEqual(created, [1])
  assert.equal(hasInput(make.render({ options: { create: true }, controller })), true)

  const reopen = harness('StudioContent')
  reopen.render({ options: { open: 'draft' }, controller }); reopen.flush(); await tick()
  assert.equal(created.length, 1, '있는 폰트를 열 때는 새 폰트를 만들지 않는다')
  assert.equal(hasInput(reopen.render({ options: { open: 'draft' }, controller })), true)

  const lost = harness('StudioContent')
  lost.render({ options: { open: 'gone' }, controller }); lost.flush(); await tick()
  assert.equal(hasHome(lost.render({ options: { open: 'gone' }, controller })), true, '없는 항목이면 자체 목록으로 돌아간다')
})

test('아무것도 쓰지 않고 입력 화면을 나가면 그 새 폰트는 저장하지 않고 지운다', async () => {
  const tick = () => new Promise(resolve => setImmediate(resolve))
  const written = { id: 'w', name: '쓴 폰트', status: 'draft', draft: { schema: 1, id: 'a', samples: { [PROMPTS[0]]: { strokes: [[1]] } } } }
  const blank = { id: 'b', name: '빈 폰트', status: 'draft', draft: { schema: 1, id: 'b', samples: {} } }
  const revision = { id: 'r', name: '고치는 폰트', status: 'draft', sourceId: 'x', draft: { schema: 1, id: 'c', samples: {} } }
  for (const [entry, removed] of [[blank, ['b']], [written, []], [revision, []]]) {
    const snapshot = { loaded: true, error: '', support: { available: false }, entries: [entry] }
    const calls = []
    const controller = { subscribe() {}, getSnapshot: () => snapshot, saveDraft: async () => {}, removeDraft: async id => { calls.push(id) } }
    const parent = harness('StudioContent')
    const render = () => parent.render({ controller })
    await find(render(), n => n.props?.accessibilityLabel?.startsWith(entry.name)).props.onPress()
    await find(render(), n => n.props?.accessibilityLabel === '폰트 화면 뒤로가기' || n.props?.onBack)?.props.onBack?.()
    await tick()
    assert.deepEqual(calls, removed, entry.name)
  }
})

test('창을 닫을 때(닫기 가드)도 아무것도 쓰지 않은 새 폰트만 지운다', async () => {
  const tick = () => new Promise(resolve => setTimeout(resolve, 5))
  for (const [value, removed] of [
    [{ id: 'b', name: '빈 폰트', status: 'draft', draft: { schema: 1, id: 'b', samples: {} } }, ['b']],
    [{ id: 'r', name: '고치는 폰트', status: 'draft', sourceId: 'x', draft: { schema: 1, id: 'c', samples: {} } }, []],
  ]) {
    const calls = [], child = harness('InputScreen')
    const props = { workflow: { saveDraft: async () => {}, removeDraft: async id => { calls.push(id) } }, value, narrow: true, busy: '', support: { available: false }, inputSave: { current: null }, onInputActiveChange() {} }
    child.render(props)
    assert.equal(await child.guards.at(-1)(), true)
    await tick()
    assert.deepEqual(calls, removed, value.name)
    child.unmount()
  }
})

// develop 은 기기당 생성 한도가 없어(manager.js) 완성 · 생성 취소 · 생성기 변경(incompatible) 폰트에서 원본 36자로 수정본을 만들 수 있다.
// 생성 중 실패한 폰트는 '다시 시도'로 이어서 만든다
test('입력 수정 버튼은 완성 · 생성 취소 · 생성기 변경 폰트에 보이고 실패 폰트에는 없다', async () => {
  const tick = () => new Promise(resolve => setImmediate(resolve))
  const draft = { schema: 1, id: 'ink', samples: {} }
  const cases = [
    [{ id: 'ready', name: '완성', status: 'ready', jobId: 'job-1', fontId: 'font-1', draft }, true],
    [{ id: 'cancelled', name: '취소', status: 'cancelled', jobId: 'job-2', draft }, true],
    [{ id: 'changed', name: '생성기 변경', status: 'failed', incompatible: true, error: '생성기가 변경됐어요.', jobId: 'job-3', draft }, true],
    [{ id: 'failed', name: '실패', status: 'failed', error: 'boom', jobId: 'job-4', draft }, false],
  ]
  for (const [entry, shown] of cases) {
    const snapshot = { loaded: true, error: '', support: { available: true }, entries: [entry] }
    const controller = { subscribe() {}, getSnapshot: () => snapshot, saveDraft: async () => {} }
    const view = harness('StudioContent')
    view.render({ options: { open: entry.id }, controller }); view.flush(); await tick()
    const tree = view.render({ options: { open: entry.id }, controller })
    assert.ok(find(tree, n => n.props?.children === '생성에 사용한 36자'), `${entry.id} 상세가 열린다`)
    assert.equal(Boolean(find(tree, n => n.type?.name === 'Button' && n.props.children === '입력 수정')), shown, entry.id)
  }
})
