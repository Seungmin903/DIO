import test from 'node:test'
import assert from 'node:assert/strict'
import { PAPER_COLOR_ROW, paperColorRow, pushPaperColor, restorePaperColors } from '../src/editor/utils/paperColorRow.js'
import { PAPER_BACKGROUNDS } from '../src/editor/templates/appearance.js'

test('속지 색 줄은 칸 4개: 직접 고른 최근 색이 왼쪽, 그 뒤 기본 견본, 지금 색은 항상 보인다', () => {
  assert.equal(PAPER_COLOR_ROW, 4)
  const presetsOnly = paperColorRow([], PAPER_BACKGROUNDS, '#FFFFFF')
  assert.deepEqual(presetsOnly.map(c => c.color), PAPER_BACKGROUNDS.slice(0, 4).map(([, c]) => c.toUpperCase()))
  assert.equal(presetsOnly[0].name, '화이트', '견본 이름을 쓴다')
  const custom = paperColorRow(['#123456'], PAPER_BACKGROUNDS, '#123456')
  assert.deepEqual(custom.map(c => c.color), ['#123456', '#FFFFFF', '#FFF8E7', '#EDF3EA'], '직접 고른 색이 왼쪽에서 들어오고 끝 색이 밀려난다')
  assert.equal(custom[0].name, '#123456', '이름 없는 색은 코드로')
  const current = paperColorRow([], PAPER_BACKGROUNDS, '#292929')
  assert.equal(current[0].color, '#292929', '보이는 4칸에 없는 지금 색(나이트 차콜)은 맨 앞에 끼운다'); assert.equal(current.length, 4)
  assert.deepEqual(paperColorRow(['#ffffff', '#FFFFFF'], PAPER_BACKGROUNDS, null).map(c => c.color), ['#FFFFFF', '#FFF8E7', '#EDF3EA', '#FBEFF0'], '중복 · 대소문자는 하나로')
})

test('저장해 둔 최근 색은 저장한 순서(최신이 앞) 그대로 돌아오고, 틀린 값 · 중복은 걸러지며 4개만 남는다', () => {
  let recent = []
  for (const color of ['#111111', '#222222', '#333333']) recent = pushPaperColor(recent, color)
  assert.deepEqual(restorePaperColors(JSON.parse(JSON.stringify(recent))), recent, '저장 → 다시 읽기가 순서를 바꾸지 않는다(앱을 다시 켜도 같은 줄)')
  assert.deepEqual(restorePaperColors(['#333333', 'red', '#222222', '#333333', null, '#111111', '#000000', '#444444']), ['#333333', '#222222', '#111111', '#000000'])
  assert.deepEqual(restorePaperColors('oops'), []); assert.deepEqual(restorePaperColors(null), [])
})

test('직접 고른 색은 최근 목록 맨 앞에 들어가고 4개만 남으며 잘못된 값은 무시한다', () => {
  let recent = []
  for (const color of ['#111111', '#222222', '#333333', '#444444', '#555555']) recent = pushPaperColor(recent, color)
  assert.deepEqual(recent, ['#555555', '#444444', '#333333', '#222222'])
  assert.deepEqual(pushPaperColor(recent, '#333333'), ['#333333', '#555555', '#444444', '#222222'], '다시 고른 색은 앞으로')
  assert.equal(pushPaperColor(recent, 'red'), recent); assert.equal(pushPaperColor(recent, null), recent)
})
