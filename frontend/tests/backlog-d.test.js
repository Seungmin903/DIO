import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { memoPaperBox } from '../src/editor/utils/editorShapes.js'
import { MEMO_ARTS } from '../src/editor/widgets/memoArt.js'
import { padRows } from '../src/editor/utils/gridRows.js'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('663 메모지 선택 상자: 종이 본체 영역이 요소 상자 안쪽으로 계산된다', () => {
  for (const art of MEMO_ARTS) {
    const box = memoPaperBox({ art: art.id, w: 220, h: 220 * art.h / art.w })
    assert.ok(box.x > 0 && box.y > 0, `${art.id} 위 · 왼쪽 여백`)
    assert.ok(box.x + box.w < 220 && box.w > 150, `${art.id} 폭`)
  }
  assert.equal(memoPaperBox({ art: null, w: 100, h: 100 }), null)
  const plain = memoPaperBox({ art: 'plain', w: 220, h: 220 })
  assert.ok(Math.abs(plain.x - 8) < 3, '무지 메모는 사방 약 8 여백')
  assert.match(read('../src/editor/components/canvas/SelectionOverlay.js'), /memoPaperBox\(object\)/)
})

test('679 옵션은 sliders 아이콘, 더보기는 점 세 개', () => {
  const bar = read('../src/editor/components/canvas/ContextBar.js')
  assert.match(bar, /icon: 'sliders', label: '옵션'/)
  assert.match(bar, /icon="more" label="더보기"/)
  assert.match(read('../src/editor/components/controls/Icon.js'), /sliders: 'M10 5H3/)
})

test('646 레이어 행: 좁은 패널에서는 간격을 줄여 이름 칸을 남긴다', () => {
  const src = read('../src/editor/components/panels/LayerPanel.js')
  assert.match(src, /CompactContext/)
  assert.match(src, /rowCompact:/)
  assert.match(src, /ROW_HEIGHT = 48/)
  assert.match(src, /rowText: \{ flex: 1, minWidth: 0 \}/)
})

test('673 사진 시트: 마지막 줄을 빈 칸으로 채워 칸 폭을 같게 한다', () => {
  const src = read('../src/editor/components/panels/PhotoSourcePicker.js')
  assert.match(src, /data=\{padRows\(/)
  assert.doesNotMatch(src, /maxWidth:`\$\{100\/columns\}%`/)
  // 실행: 모자란 칸만큼 빈 칸을 채우고, 딱 맞으면 그대로
  assert.deepEqual(padRows([1, 2, 3, 4], 3), [1, 2, 3, 4, { __filler: 0 }, { __filler: 1 }])
  assert.deepEqual(padRows([1, 2, 3], 3), [1, 2, 3])
  assert.deepEqual(padRows([], 3), [])
})

test('663 리뷰: 메모 윤곽은 절대 좌표 M · L · Q · C · Z 만 쓰고, 다른 명령이 섞이면 상자 전체로 둔다', () => {
  for (const art of MEMO_ARTS) assert.doesNotMatch(art.outline, /[^MLQCZ\d\s.,-]/, `${art.id} 윤곽 명령`)
  const plain = MEMO_ARTS[0]
  const box = memoPaperBox({ art: plain.id, w: 200, h: 200 })
  assert.ok(box.w < 200 && box.h < 200)
  // 같은 id 의 윤곽을 상대 좌표로 바꾼 경우를 흉내 낸다
  const saved = plain.outline
  try { plain.outline = 'm4 4 h92 v92 h-92 z'; assert.equal(memoPaperBox({ art: plain.id, w: 200, h: 200 }), null) }
  finally { plain.outline = saved }
  // 앞자리 0을 뺀 소수(.5)도 한 숫자로 읽는다
  try { plain.outline = 'M.5 .5 L99.5 .5 L99.5 99.5 L.5 99.5 Z'; const b = memoPaperBox({ art: plain.id, w: 200, h: 200 }); assert.equal(b.x, 1); assert.equal(b.w, 198) }
  finally { plain.outline = saved }
})

test('698 확대 숫자 칸은 세 자리와 단위가 들어가는 폭', () => {
  assert.match(read('../src/editor/components/controls/Slider.js'), /width: 60,/)
})

test('640 한눈에 보기 표지는 칸 왼쪽 끝에 붙는다', () => {
  const src = read('../src/diary/components/Cover.js')
  assert.match(src, /gridStart = grid && !centered/)
  assert.match(src, /gridStart: \{ alignItems: 'flex-start' \}/)
})
