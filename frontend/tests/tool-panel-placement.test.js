import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { OPTIONS_TOP, OPTIONS_TOP_PHONE, OPTIONS_WIDTH, optionsPlacement, tabletToolPopover } from '../src/editor/utils/toolPanelPlacement.js'

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
