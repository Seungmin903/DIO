import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('591: 회원 새 다이어리도 속지 구역을 쓴다(날짜 속지는 member-dated-papers.test.js)', () => {
  assert.match(read('../App.js'), /serverPapers=\{member && !editingDiaryId\}/)
  assert.doesNotMatch(read('../App.js'), /blankOnly=\{member/)
  assert.match(read('../src/diary/components/DiaryCreateModal.js'), /plainOnly=\{!editing && \(blankOnly \|\| serverPapers \|\|/)
})

test('611 · 612: 폰 스와이프는 좌우 화살표, 옆 카드는 화면 밖, 카드 줄은 가운데보다 살짝 위', () => {
  const screen = read('../src/diary/screens/LibraryScreen.js')
  assert.match(screen, /compact \? Math\.max\(11, Math\.round\(carouselSidePadding\) \+ 8\)/)
  assert.doesNotMatch(screen, /!compact && hasPrevious/)
  assert.doesNotMatch(screen, /!compact && hasNext/)
  const styles = read('../src/diary/styles.js')
  assert.match(styles, /carouselShellCompact: \{ minHeight: 0, paddingTop: 12, paddingBottom: 60, marginHorizontal: -14 \}/)
  assert.match(styles, /carouselRowCompact: \{ flex: 1, height: 'auto', minHeight: 0, alignItems: 'center' \}/)
  assert.match(styles, /carouselArrowCompact: \{ marginTop: -62 \}/)
})

test('610: 폰 펼쳐서는 옆 다이어리 책등과 펼친 다이어리 사이를 14 띄운다', () => {
  const shelf = read('../src/diary/components/OpenBookShelf.js')
  assert.match(shelf, /const PHONE_SIDE_GAP = 14/)
  assert.match(shelf, /width: area\.width - \(compact \? 2 \* \(SPINE \+ PHONE_SIDE_GAP\) :/)
})

test('681: 펼쳐서 책 · 화살표 높이를 스와이프와 맞춘다(가로 태블릿은 스와이프 화살표 줄, 폰은 폰 값) · 폰도 화살표를 화면 끝 4 자리에', () => {
  const shelf = read('../src/diary/components/OpenBookShelf.js')
  assert.match(shelf, /const SWIPE_ROW_CENTER = s\.carouselShell\.paddingTop \+ s\.carouselRow\.height \/ 2/)
  assert.match(shelf, /upright \? area\.height \/ 2 - \(compact \? PHONE_SWIPE_CENTER_UP : SWIPE_CENTER_UP\)/)
  assert.match(shelf, /: compact \? null : SWIPE_ROW_CENTER/)
  assert.match(shelf, /const PHONE_EDGE = s\.libraryScreenCompact\.paddingHorizontal/)
  assert.match(shelf, /const PHONE_ARROW_SIDE = 4;/)
  assert.match(shelf, /phoneFrame: \{ flex: 1, minHeight: 420, marginHorizontal: -PHONE_EDGE \}/)
  assert.match(shelf, /compact \? styles\.phoneArea : styles\.bleed/)
  assert.match(shelf, /\[side\]: compact \? PHONE_ARROW_SIDE : BLEED \+ 4/)
  assert.match(shelf, /return compact \? <View style=\{styles\.phoneFrame\} pointerEvents="box-none">\{shelf\}\{arrows\}<\/View> : shelf/)
})

test('681: 펼쳐서 맞춤에 쓰는 스와이프 스타일 값이 숫자다(NaN 이면 가로 태블릿 배치가 깨진다)', () => {
  const styles = read('../src/diary/styles.js')
  assert.match(styles, /carouselShell: \{ minHeight: 510, flex: 1, paddingTop: (\d+),/)
  assert.match(styles, /carouselRow: \{ height: (\d+),/)
  assert.match(styles, /libraryScreenCompact: \{ paddingHorizontal: (\d+),/)
})
