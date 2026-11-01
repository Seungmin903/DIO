import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as selection from '../src/editor/utils/stickerCutout.js'
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/panels/StickerCutoutModal.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
const find = (tree, name) => nodes(tree).find(n => n.props.label === name || n.props.accessibilityLabel === name || n.props.testID === name)
// 헤더 왼쪽 < (나가기)는 공용 상단 바(MakerHeader)가 그린다: 바에 넘긴 동작을 눌린 버튼처럼 다룬다
const header = tree => nodes(tree).find(n => n.props.backLabel)
const closeButton = tree => ({ props: { onPress: header(tree).props.onBack } })
// 단계 이동 줄(MakerNav)의 `이전`
const prevButton = tree => nodes(tree).find(n => n.props.onPrev)
const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture(photoPicker, preview) {
  let si = 0, ri = 0, ei = 0, closed = 0
  const states = [], refs = [], deps = [], cleanups = []
  const react = {
    useState(initial) { const i = si++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next }] },
    useRef(initial) { const i = ri++; return refs[i] ??= { current: initial } },
    useEffect(fn, next) { const i = ei++; if (!deps[i] || next.some((v, k) => v !== deps[i][k])) { cleanups[i]?.(); deps[i] = next; cleanups[i] = fn() } },
  }
  const native = { StyleSheet: { create: v => v }, useWindowDimensions: () => ({ width: 1280, height: 800 }) }
  for (const id of ['ActivityIndicator', 'Image', 'Pressable', 'ScrollView', 'Text', 'View']) native[id] = id
  const mocks = { react, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'react-native-svg': { __esModule: true, default: 'Svg', Defs: 'Defs', Image: 'SvgImage', Mask: 'Mask', Path: 'Path', Pattern: 'Pattern', Rect: 'Rect' },
    '../../../shared/theme': { colors: {}, radius: {}, DISABLED_OPACITY: .4 },
    '../../utils/svgId': { useSvgId: () => 'cutout-test' }, '../../utils/stickerCutout': selection,
    '../../services/stickerCutout': { pickCutoutPhoto: photoPicker },
  }
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => id === 'react/jsx-runtime' ? require(id) : mocks[id] ?? { __esModule: true, default: id }, mod, mod.exports)
  const render = () => { si = ri = ei = 0; return mod.exports.default({ folder: { name: '내 폴더' }, onClose: () => closed++, photoPicker, ...(preview ? { preview } : {}) }) }
  render()
  return { render, unmount: () => cleanups.forEach(fn => fn?.()), get closed() { return closed } }
}
async function load(ui) {
  find(ui.render(), '사진 선택').props.onPress(); await tick()
  find(ui.render(), 'cutout-viewport').props.onLayout({ nativeEvent: { layout: { width: 300, height: 200 } } })
  const tree = ui.render()
  nodes(tree).find(n => n.type === 'Image').props.onLoad()
  ui.render()
}
// 칠한 영역이 있으면 이미지 바꾸기는 확인 창을 먼저 연다
async function changeImage(ui) {
  find(ui.render(), '이미지 바꾸기').props.onPress()
  const dialog = nodes(ui.render()).find(n => n.props.confirmLabel === '이미지 바꾸기')
  if (dialog.props.open) dialog.props.onConfirm()
  await tick()
}
function draw(ui) {
  const area = find(ui.render(), 'cutout-canvas')
  area.props.onResponderGrant({ nativeEvent: { locationX: 20, locationY: 20 } })
  area.props.onResponderMove({ nativeEvent: { locationX: 80, locationY: 80 } })
  area.props.onResponderRelease()
}

test('같은 URI 재선택도 이미지를 새로 로드하며 이전 로드 콜백은 무시한다', async () => {
  const ui = fixture(async () => ({ uri: 'same-photo', width: 100, height: 100 }))
  await load(ui); draw(ui)
  const oldImage = nodes(ui.render()).find(n => n.type === 'Image')
  await changeImage(ui)
  const nextImage = nodes(ui.render()).find(n => n.type === 'Image')
  assert.notEqual(nextImage.key, oldImage.key)
  oldImage.props.onLoad()
  assert.equal(find(ui.render(), '선택 추가').props.disabled, true)
  nextImage.props.onLoad()
  assert.equal(find(ui.render(), '선택 추가').props.disabled, false)
  draw(ui)
  assert.equal(find(ui.render(), '다음 · 스티커 확인').props.disabled, false)
  ui.unmount()
})

test('좁은 세로 사진의 큰 붓은 사진 너비로 제한하고 손을 떼도 획을 보존한다', async () => {
  let input
  const ui = fixture(async () => ({ uri: 'tall-photo', width: 100, height: 4000 }), async (_source, history) => { input = history })
  await load(ui)
  const slider = nodes(ui.render()).find(n => n.props.label === '브러시 크기')
  slider.props.onCommit(80)
  const area = find(ui.render(), 'cutout-canvas')
  area.props.onResponderGrant({ nativeEvent: { locationX: 2, locationY: 20 } })
  area.props.onResponderRelease()
  assert.equal(find(ui.render(), '되돌리기').props.disabled, false)
  find(ui.render(), '다음 · 스티커 확인').props.onPress(); await tick()
  assert.equal(input.strokes.length, 1)
  assert.equal(input.strokes[0].width, 1)
  ui.unmount()
})
test('사진 선택 연타와 폐기 후 응답은 상태 변경 없이 임시 사진을 해제한다', async () => {
  let finish, calls = 0, disposed = 0
  const ui = fixture(() => { calls++; return new Promise(resolve => { finish = resolve }) })
  const choose = find(ui.render(), '사진 선택')
  choose.props.onPress(); choose.props.onPress()
  assert.equal(calls, 1)
  ui.unmount()
  finish({ uri: 'photo', width: 100, height: 100, dispose: () => disposed++ }); await tick()
  assert.equal(disposed, 1)
})
test('사진 재선택 취소는 기존 선택을 유지하고 새 사진으로 바꾸면 이력을 초기화·기존 사진 해제한다', async () => {
  let calls = 0, disposed = 0
  const ui = fixture(async () => ++calls === 2 ? null : ({ uri: `photo-${calls}`, width: 100, height: 100, dispose: () => disposed++ }))
  await load(ui); draw(ui)
  assert.equal(find(ui.render(), '다음 · 스티커 확인').props.disabled, false)
  await changeImage(ui)
  assert.equal(find(ui.render(), '되돌리기').props.disabled, false)
  assert.equal(disposed, 0)
  await changeImage(ui)
  assert.equal(find(ui.render(), '되돌리기').props.disabled, true)
  assert.equal(disposed, 1)
  ui.unmount(); assert.equal(disposed, 2)
})
test('선택 미리보기 실패 후 입력 유지·재시도와 닫기 취소, 저장 목업 확정을 분리한다', async () => {
  let requests = 0
  const ui = fixture(async () => ({ uri: 'photo', width: 100, height: 100 }), async () => { if (++requests === 1) throw new Error('재시도 안내') })
  await load(ui); draw(ui)
  find(ui.render(), '다음 · 스티커 확인').props.onPress(); await tick()
  assert.ok(nodes(ui.render()).some(n => n.props.children === '재시도 안내'))
  assert.equal(find(ui.render(), '되돌리기').props.disabled, false)
  closeButton(ui.render()).props.onPress()
  nodes(ui.render()).find(n => n.props.confirmLabel === '나가기').props.onCancel()
  assert.equal(ui.closed, 0)
  find(ui.render(), '다음 · 스티커 확인').props.onPress(); await tick()
  find(ui.render(), '저장 흐름 확인').props.onPress()
  const confirm = nodes(ui.render()).find(n => n.props.confirmLabel === '확인')
  assert.match(confirm.props.message, /저장되지 않아요/)
  confirm.props.onConfirm()
  assert.equal(find(ui.render(), '저장 흐름 확인').props.disabled, true)
  closeButton(ui.render()).props.onPress()
  assert.equal(ui.closed, 1)
})

test('결과 확인에서 헤더 이전·기기 뒤로가기로 돌아오면 같은 사진과 붓질을 유지한다', async () => {
  const ui = fixture(async () => ({ uri: 'photo', width: 100, height: 100 }))
  await load(ui); draw(ui)
  assert.equal(prevButton(ui.render()), undefined) // ① 에는 `이전`이 없고 헤더 < 는 나가기
  assert.equal(header(ui.render()).props.backLabel, '스티커 만들기 나가기')
  find(ui.render(), '다음 · 스티커 확인').props.onPress(); await tick()
  assert.ok(find(ui.render(), '2단계 스티커 확인'))
  assert.ok(nodes(ui.render()).some(n => n.type === 'Pattern'))
  assert.equal(find(ui.render(), '선택 수정'), undefined) // 돌아가기는 헤더 뒤로 하나
  assert.equal(find(ui.render(), '브러시 크기'), undefined) // ① 도구를 ② 에 다시 띄우지 않는다
  assert.equal(find(ui.render(), '스티커 폴더 이름'), undefined) // 연 폴더에 넣을 때는 이름만 보인다
  assert.equal(nodes(ui.render()).find(n => n.props.onStep).props.onStep !== undefined, true) // 단계 표시의 지난 단계로도 돌아간다
  prevButton(ui.render()).props.onPrev()
  assert.ok(find(ui.render(), '1단계 대상 고르기'))
  assert.equal(find(ui.render(), '되돌리기').props.disabled, false)
  find(ui.render(), '다음 · 스티커 확인').props.onPress(); await tick()
  nodes(ui.render()).find(n => n.props.onRequestClose).props.onRequestClose()
  assert.equal(find(ui.render(), '되돌리기').props.disabled, false)
  assert.equal(ui.closed, 0)
  ui.unmount()
})
