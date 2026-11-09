import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('648: 폰 더보기 메뉴는 항목이 다 보이는 높이까지 펴지고, 자리가 모자랄 때만 줄어 스크롤한다', () => {
  const bar = read('../src/editor/components/canvas/ContextBar.js')
  assert.match(bar, /const COMPACT_MENU_MAX_ROWS = 8\nconst COMPACT_MENU_HEIGHT = COMPACT_MENU_MAX_ROWS \* 48 \+ 10/)
  assert.doesNotMatch(bar, /4\.5 \* 44/)
  // 아래에 메뉴 전체가 안 들어가고 위가 더 넓으면 위로 올린다
  assert.match(bar, /const below = spaceBelow >= COMPACT_MENU_HEIGHT \|\| spaceBelow >= spaceAbove/)
})

test('659: 색 견본 격자는 칸 사이 4 까지 줄여 7칸(견본 6 + 직접 고르기)이 한 줄에 든다', () => {
  const controls = read('../src/diary/components/FormControls.js')
  assert.match(controls, /const CELL = 36, CELL_GAP = 4/)
  assert.match(controls, /maxColumns: GRID_COLUMNS/)
  // 7칸 최소 폭 = 36 * 7 + 4 * 6 = 276
  assert.ok(36 * 7 + 4 * 6 <= 300)
})

test('660: 내 표지 썸네일도 내 속지 썸네일처럼 테두리 · 둥근 모서리가 있다', () => {
  const pdf = read('../src/diary/components/PdfImport.js')
  assert.match(pdf, /<View style=\{\[tile, styles\.coverThumb\]\}><CoverArt/)
  assert.match(pdf, /coverThumb: \{ overflow: 'hidden', borderRadius: 4, borderWidth: StyleSheet\.hairlineWidth, borderColor: colors\.border \}/)
})

test('666: 알림 닫기 X 는 보이는 끝을 모두 읽음 글자 끝과 같은 기준선에 맞춘다', () => {
  const panel = read('../src/notifications/NotificationPanel.js')
  assert.match(panel, /icon === 'close' \? s\.trailingClose : s\.trailingIcon/)
  assert.match(panel, /trailingClose: \{ marginRight: -17 \}/)
})

test('661: 알림 빈 상태는 종 아이콘 대신 다른 빈 화면과 같은 EmptyState 를 쓴다', () => {
  const panel = read('../src/notifications/NotificationPanel.js')
  assert.match(panel, /import EmptyState from '\.\.\/diary\/components\/EmptyState'/)
  assert.match(panel, /testID="notification-empty"[^>]*><EmptyState compact art="dio" title="받은 알림이 없어요" \/>/)
  assert.doesNotMatch(panel, /<AppIcon name="bell" size=\{32\}/)
})

test('675: 폰 공방 폴더 안에서는 폴더 목록 버튼이 아이콘 버튼이라 제목이 쓸 폭을 남긴다', () => {
  const screen = read('../src/diary/screens/DecorationStudioScreen.js')
  assert.equal((screen.match(/variant=\{compact \? 'icon' : 'ghost'\} icon="chevron-left" label="(스티커|테이프) 폴더 목록"/g) || []).length, 2)
})

test('659 리뷰: 색 견본 좌우 터치 여유는 칸 사이 폭의 절반까지만(이웃 견본과 겹치지 않게)', () => {
  const src = read('../src/diary/components/FormControls.js')
  assert.match(src, /const side = Math\.max\(0, Math\.min\(6, Math\.floor\(grid\.spreadGap \/ 2\)\)\)/)
  assert.match(src, /<SwatchSlop\.Provider value=\{slop\}>/)
  assert.equal((src.match(/hitSlop=\{slop\}/g) || []).length, 3)
})

test('675 추가: 스티커 폴더 안 추가는 머리줄 아래 `스티커 추가` 버튼 + 시트 분리 · 이미지 넣기 말풍선', () => {
  const screen = read('../src/diary/screens/DecorationStudioScreen.js')
  assert.doesNotMatch(screen, /label="이 폴더에 스티커 추가"/)
  assert.match(screen, /\{folder && <View style=\{s\.addRow\}>\{addTool\(\{ kind: 'stickerIn', icon: 'sticker', title: '스티커 추가'/)
  assert.match(screen, /addMenu\.kind === 'stickerIn' \? \[/)
  assert.match(screen, /text: '시트에서 분리하기'/)
  assert.match(screen, /openPickerAfterMenu\(\(\) => addStickerImages\(folder\.id\)\)/)
  assert.match(screen, /tool === 'splitIn' \? folder : undefined/)
})

test('675 추가: 테이프 폴더 안 추가도 머리줄 아래 `테이프 추가` 버튼이고 바로 사진을 고른다', () => {
  const screen = read('../src/diary/screens/DecorationStudioScreen.js')
  assert.doesNotMatch(screen, /label="이 폴더에 테이프 추가"/)
  assert.match(screen, /\{tapeFolder && <View style=\{s\.addRow\}>\{addTool\(\{ kind: 'tapeIn', icon: 'tape', title: '테이프 추가'.*onPress: \(\) => addTapeFromPhoto\(tapeFolder\.id\)/)
})
