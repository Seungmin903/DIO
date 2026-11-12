import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const read = file => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')

test('668: 폰 상단 바는 만들기 높이 40 · 좌우 여백 16 으로 대칭', () => {
  const src = read('diary/components/Workbench.js')
  assert.match(src, /submitSheet: \{[^}]*height: 40/)
  assert.match(src, /topbarSheet: \{ paddingHorizontal: 16 \}/)
  assert.match(src, /cancelSheet: \{ alignItems: 'flex-start'/)
})

test('669: 속지 색 탭은 같은 뜻 라벨을 하나만 둔다', () => {
  const src = read('diary/components/PaperOptions.js')
  assert.doesNotMatch(src, /<OptionRow label="종이 색">/)
  assert.match(src, /heading="종이 색"/)
  assert.match(read('editor/components/controls/EditablePalette.js'), /heading \?\? `\$\{label\} 색상`/)
})

test('671: 소제목 라벨 왼쪽 · 토글 오른쪽 끝', () => {
  const src = read('diary/components/CoverOptions.js')
  assert.ok(src.indexOf('styles.subTitle}>소제목') < src.indexOf('label={`소제목 ${'))
  assert.match(src, /subHead: \{[^}]*justifyContent: 'space-between'/)
})

test('652: 폰 속지 탭 미리보기는 알약 · 간격 몫을 빼 위 여백을 지킨다', () => {
  const src = read('diary/components/DiaryCreateModal.js')
  assert.match(src, /const reserve = stacked \? 38 : 0/)
  assert.ok((src.match(/maxHeight - reserve/g) ?? []).length >= 3)
})

test('658: 테이프 삭제는 휴지통 아이콘', () => {
  const src = read('diary/screens/DecorationStudioScreen.js')
  const at = src.indexOf('번 테이프 삭제')
  assert.match(src.slice(at, at + 500), /name="trash"/)
})

test('677: 내 표지 견본은 바깥 둥근 틀로 다시 자르지 않는다', () => {
  const src = read('diary/components/StudioShelf.js')
  assert.match(src, /paper \? local\.art : local\.coverArt/)
  assert.match(src, /coverArt: \{ alignItems/)
})

test('678: 추가 버튼을 누르면 이름 입력을 먼저 닫는다', () => {
  const src = read('diary/screens/DecorationStudioScreen.js')
  assert.match(src, /Keyboard\.dismiss\(\); if \(menu\) openAddMenu\(kind\)/)
})
