import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('591: 회원 새 다이어리도 속지 구역을 쓰되 날짜 없는 속지만(서버에 날짜 칸이 없다)', () => {
  assert.match(read('../App.js'), /serverPapers=\{member && !editingDiaryId\}/)
  assert.doesNotMatch(read('../App.js'), /blankOnly=\{member/)
  const modal = read('../src/diary/components/DiaryCreateModal.js')
  assert.match(modal, /const paperSections = serverPapers \? storedSections\.map\(item => \(item\.dated \? \{ \.\.\.item, dated: false \} : item\)\) : storedSections;/)
  assert.match(modal, /<PaperOptions sections=\{paperSections\} undatedOnly=\{serverPapers\}/)
  assert.match(modal, /plainOnly=\{!editing && \(blankOnly \|\| serverPapers \|\|/)
  const options = read('../src/diary/components/PaperOptions.js')
  assert.match(options, /\{!undatedOnly && <OptionRow label="날짜">/)
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
