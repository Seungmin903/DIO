import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { OPTIONS_TOP, OPTIONS_TOP_PHONE, OPTIONS_TYPING_HEIGHT, OPTIONS_WIDTH, optionsPlacement, tabletToolPopover, typingOptionsPlacement, typingRevealDy, typingViewRestore } from '../src/editor/utils/toolPanelPlacement.js'

const STAGE = { width: 900, height: 700 }
const at = (y) => [{ x: 40, y, w: 100, h: 40, rotation: 0 }]
const source = readFileSync(new URL('../src/editor/screens/EditorScreen.js', import.meta.url), 'utf8')

test('옵션 창 위쪽 기준: 태블릿은 작업창 위 끝, 폰은 기존 76을 유지한다', () => {
  assert.equal(optionsPlacement(at(0), 1, { x: 0, y: 0 }, STAGE).top, OPTIONS_TOP)
  assert.equal(optionsPlacement(at(0), 1, { x: 0, y: 0 }, STAGE, OPTIONS_TOP_PHONE).top, OPTIONS_TOP_PHONE)
  assert.equal(OPTIONS_TOP, 8)
  assert.equal(OPTIONS_TOP_PHONE, 76)
})

test('옵션 창은 요소 위 끝에 맞추고 아래쪽 되돌리기 막대 자리를 비운다', () => {
  const placed = optionsPlacement(at(100), 1, { x: 0, y: 20 }, STAGE)
  assert.equal(placed.top, 120)
  assert.equal(placed.top + placed.height, STAGE.height - 64)
})

test('옵션 창은 좁은 작업창에서도 좌우 안에 있다', () => {
  const stage = { width: 420, height: 700 }
  const { left } = optionsPlacement(at(100), 1, { x: 0, y: 0 }, stage)
  assert.ok(left >= 12 && left + OPTIONS_WIDTH <= stage.width - 12 + 0.001, `left ${left}`)
})

test('도구 설정 창은 누른 도구 가운데에 맞추고 작업창 위 끝에서 8 띄운다', () => {
  const placed = tabletToolPopover({ width: 320, anchor: { x: 700, width: 44 }, stageOrigin: { x: 192, y: 102 }, stageWidth: 812 })
  assert.equal(placed.left, 700 - 192 + 22 - 160)
  assert.equal(placed.top, 8)
  assert.equal(placed.bottom, 64)
})

test('도구 설정 창은 작업창 좌우 8 안으로 제한한다', () => {
  const stageOrigin = { x: 192, y: 102 }
  const nearLeft = tabletToolPopover({ width: 320, anchor: { x: 100, width: 44 }, stageOrigin, stageWidth: 812 })
  assert.equal(nearLeft.left, 8)
  const nearRight = tabletToolPopover({ width: 320, anchor: { x: 1000, width: 44 }, stageOrigin, stageWidth: 812 })
  assert.equal(nearRight.left, 812 - 320 - 8)
})

test('패널을 닫아 작업창이 넓어져도 도구 설정 창은 같은 화면 자리에 뜬다', () => {
  const anchor = { x: 500, width: 44 }
  const open = tabletToolPopover({ anchor, stageOrigin: { x: 192, y: 102 }, stageWidth: 812 })
  const closed = tabletToolPopover({ anchor, stageOrigin: { x: 0, y: 102 }, stageWidth: 1280 })
  assert.equal(open.left + 192, closed.left)
})

test('태블릿 도구 줄은 작업창 밖에 두어 패널 폭의 영향을 받지 않는다', () => {
  const ribbon = source.indexOf('<Ribbon')
  assert.ok(ribbon > 0 && ribbon < source.indexOf('<View ref={stageRef}'), '도구 줄이 작업창보다 먼저 그려져야 한다')
  assert.ok(ribbon < source.indexOf('styles.body, compact'), '도구 줄이 패널이 든 본문 밖에 있어야 한다')
})

test('옵션 창 입력칸에 적는 동안 키보드가 창을 가리면 창을 키보드 바로 위로 내려 낮게 줄인다', () => {
  const base = { left: 300, top: 8, height: 628 }
  // 작업창이 화면 y=100에서 시작하고 키보드가 화면 y=500에서 시작한다 → 작업창 기준 400
  const place = typingOptionsPlacement(base, { stageTop: 100, stageHeight: 700, keyboardTop: 500 })
  assert.equal(place.left, 300)
  assert.equal(place.top + place.height, 392) // 키보드 위 8
  assert.equal(place.height, OPTIONS_TYPING_HEIGHT)
  // 키보드가 작업창을 줄이는 환경은 작업창 아래 끝까지만 쓴다
  const resized = typingOptionsPlacement({ left: 0, top: 8, height: 628 }, { stageTop: 100, stageHeight: 300, keyboardTop: 500 })
  assert.equal(resized.top + resized.height, 292)
  // 자리가 모자라면 위 끝을 넘지 않는다
  const tight = typingOptionsPlacement(base, { stageTop: 0, stageHeight: 700, keyboardTop: 120 })
  assert.equal(tight.top, OPTIONS_TOP)
  assert.equal(tight.height, 104)
})

test('창이 이미 키보드 위에 다 보이거나 키보드가 없으면 자리를 바꾸지 않는다', () => {
  const base = { left: 10, top: 8, height: 300 }
  assert.equal(typingOptionsPlacement(base, { stageTop: 0, stageHeight: 700, keyboardTop: 400 }), base)
  assert.equal(typingOptionsPlacement(base, { stageTop: 0, stageHeight: 700, keyboardTop: null }), base)
})

test('편집 화면은 옵션 창 입력 중 상태를 받아 창 자리를 키보드 위로 옮긴다', () => {
  assert.match(source, /onTypingChange=\{setOptionsTyping\}/)
  assert.match(source, /optionsTyping \? typingOptionsPlacement\(base/)
})

test('적기 시작할 때 요소가 내려온 옵션 창과 가로로 겹치면 창 위 끝 위로 올린다', () => {
  const place = { left: 300, top: 400, height: 168 }
  // 요소 아래 끝 500, 창 위 끝 400 → 500 - (400 - 8) = 108 만큼
  assert.equal(typingRevealDy({ element: { left: 320, right: 420, top: 300, bottom: 500 }, place, keyboardLine: 580 }), 108)
  // 경계: 요소 오른쪽 끝이 창 왼쪽 끝과 딱 맞닿으면 겹치지 않아 키보드 위 끝 기준 → 아래 끝(500)이 이미 572 위라 0
  assert.equal(typingRevealDy({ element: { left: 200, right: 300, top: 300, bottom: 500 }, place, keyboardLine: 580 }), 0)
  // 창 오른쪽 끝(300 + 너비)을 지난 요소도 겹치지 않는다
  assert.equal(typingRevealDy({ element: { left: 300 + OPTIONS_WIDTH, right: 700, top: 300, bottom: 500 }, place, keyboardLine: 580 }), 0)
})

test('겹치지 않는 요소는 키보드 위 끝 기준으로 올리고, 위 끝을 넘겨 올리지 않는다', () => {
  const place = { left: 500, top: 400, height: 168 }
  // 키보드 위 끝 450 → 아래 끝 520 - (450 - 8) = 78
  assert.equal(typingRevealDy({ element: { left: 0, right: 100, top: 300, bottom: 520 }, place, keyboardLine: 450 }), 78)
  // 요소가 커서 다 못 올리면 위 끝이 작업창 위 8에 닿을 만큼만 (40 - 8 = 32)
  assert.equal(typingRevealDy({ element: { left: 0, right: 100, top: 40, bottom: 600 }, place, keyboardLine: 450 }), 32)
  // 이미 위 끝에 붙은 요소는 올리지 않는다
  assert.equal(typingRevealDy({ element: { left: 0, right: 100, top: 8, bottom: 600 }, place, keyboardLine: 450 }), 0)
  // 잴 수 없으면 올리지 않는다
  assert.equal(typingRevealDy({ element: { left: 0, right: 100, top: 300, bottom: 520 }, place, keyboardLine: NaN }), 0)
})

test('적기를 마치면 올린 보기가 그대로일 때만 올리기 전 보기로 되돌린다', () => {
  const saved = { before: { scale: 1, x: null, y: null }, after: { scale: 1, x: 10, y: -108 } }
  assert.deepEqual(typingViewRestore(saved, { scale: 1, x: 10, y: -108 }), saved.before)
  assert.deepEqual(typingViewRestore(saved, { scale: 1, x: 10.2, y: -107.8 }), saved.before) // 반올림 오차
  // 적는 동안 직접 옮기거나 확대했으면 되돌리지 않는다
  assert.equal(typingViewRestore(saved, { scale: 1, x: 10, y: -40 }), null)
  assert.equal(typingViewRestore(saved, { scale: 1.5, x: 10, y: -108 }), null)
  // 올리지 않았으면 되돌릴 것도 없다
  assert.equal(typingViewRestore(null, { scale: 1, x: 0, y: 0 }), null)
})
