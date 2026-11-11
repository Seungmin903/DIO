import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  readingEdgeMessage, turnLift, turnProgress, turnShouldComplete,
  TURN_DRAG_SPAN, TURN_FINISH_RATIO, TURN_FLICK_SPEED,
} from '../src/editor/utils/pageTurn.js'

test('가운데를 잡으면 곧은 접힘선, 위·아래 모서리 쪽을 잡으면 대각선이다', () => {
  assert.equal(turnLift(0.5), 0)
  assert.equal(turnLift(0.45), 0)
  assert.equal(turnLift(0.55), 0)
  assert.ok(Math.abs(turnLift(0.4) - (-0.1 / 0.35)) < 1e-9) // 가운데 띠(|lift|<0.25) 바깥에서는 비례해서 기운다
  assert.equal(turnLift(0), -1)
  assert.equal(turnLift(1), 1)
  assert.equal(turnLift(0.15), -1)
  assert.equal(turnLift(0.85), 1)
})

test('곧은 접힘선 띠의 경계: 가운데에서 35% 구간의 25% 이내만 0', () => {
  const edge = 0.5 + 0.35 * 0.25
  assert.equal(turnLift(edge - 0.001), 0)
  assert.ok(turnLift(edge + 0.001) > 0.24)
  assert.ok(turnLift(0.5 - 0.35 * 0.25 - 0.001) < -0.24)
  assert.equal(turnLift(0.5 - 0.35 * 0.25 + 0.001), 0)
})

test('높이를 알 수 없으면 곧게 접는다', () => {
  assert.equal(turnLift(NaN), 0)
  assert.equal(turnLift(undefined), 0)
  assert.equal(turnLift(null), 0)
  assert.equal(turnLift(Infinity), 0)
})

test('넘김 진행도는 해당 방향으로 끈 만큼만, 0~1 로 제한된다', () => {
  const width = 1000
  assert.equal(turnProgress({ dir: 1, dx: -450, width }), 0.5) // 폭의 90% 가 끝
  assert.equal(turnProgress({ dir: 1, dx: -900, width }), 1)
  assert.equal(turnProgress({ dir: 1, dx: -2000, width }), 1)
  assert.equal(turnProgress({ dir: 1, dx: 200, width }), 0) // 반대로 끌면 0
  assert.equal(turnProgress({ dir: -1, dx: 450, width }), 0.5)
  assert.equal(turnProgress({ dir: -1, dx: -300, width }), 0)
  assert.equal(turnProgress({ dir: 1, dx: -450, width: 0 }), 0)
  assert.equal(TURN_DRAG_SPAN, 0.9)
})

test('놓을 때 30% 넘게 넘어갔으면 마저 넘기고 아니면 되돌린다', () => {
  const base = { dir: 1, dx: -100, duration: 1000 }
  assert.equal(turnShouldComplete({ ...base, progress: TURN_FINISH_RATIO + 0.01 }), true)
  assert.equal(turnShouldComplete({ ...base, progress: TURN_FINISH_RATIO }), false) // 정확히 30% 는 아직 안 넘어감
  assert.equal(turnShouldComplete({ ...base, progress: 0.1 }), false)
})

test('빠르게 끌었으면 덜 넘어갔어도 마저 넘긴다. 반대 방향 빠른 끌기는 넘기지 않는다', () => {
  assert.equal(turnShouldComplete({ progress: 0.1, dir: 1, dx: -100, duration: 100 }), true) // 1.0dp/ms
  assert.equal(turnShouldComplete({ progress: 0.1, dir: -1, dx: 100, duration: 100 }), true)
  assert.equal(turnShouldComplete({ progress: 0.1, dir: 1, dx: 100, duration: 100 }), false) // 반대로 빠르게
  assert.equal(turnShouldComplete({ progress: 0.1, dir: 1, dx: -40, duration: 100 }), false) // 정확히 0.4dp/ms 는 아직
  assert.ok(TURN_FLICK_SPEED === 0.4)
  assert.equal(turnShouldComplete({ progress: 0.1, dir: 1, dx: -100, duration: 0 }), true) // 시간 0 도 0 으로 나누지 않는다
})

test('두 손가락이 닿는 등 취소되면 많이 넘어갔어도 되돌린다', () => {
  assert.equal(turnShouldComplete({ progress: 0.9, dir: 1, dx: -900, duration: 100, cancelled: true }), false)
})

test('첫·마지막 페이지에서 더 넘기려 하면 안내하고 그 사이는 안내하지 않는다', () => {
  assert.equal(readingEdgeMessage(-1, 4), '첫 페이지예요')
  assert.equal(readingEdgeMessage(4, 4), '마지막 페이지예요')
  assert.equal(readingEdgeMessage(0, 4), null)
  assert.equal(readingEdgeMessage(3, 4), null)
  assert.equal(readingEdgeMessage(0, 1), null) // 한 페이지 문서의 유일한 페이지 자체는 안내 대상이 아니다
  assert.equal(readingEdgeMessage(1, 1), '마지막 페이지예요')
})

test('읽기 모드를 끄거나 화면을 닫으면 진행 중인 넘김 애니메이션을 멈춘다', () => {
  const editor = readFileSync(new URL('../src/editor/screens/EditorScreen.js', import.meta.url), 'utf8')
  assert.match(editor, /if \(!readOnly\) \{ flip\.stopAnimation\(\)/)
  assert.match(editor, /useEffect\(\(\) => \(\) => flip\.stopAnimation\(\), \[flip\]\)/)
})

test('웹 넘김은 Animated 비공개 API(__getValue)를 쓰지 않는다', () => {
  const turn = readFileSync(new URL('../src/editor/components/canvas/ReadingPageTurn.js', import.meta.url), 'utf8')
  assert.doesNotMatch(turn.replace(/\/\/.*$/gm, ''), /__getValue/)
})
