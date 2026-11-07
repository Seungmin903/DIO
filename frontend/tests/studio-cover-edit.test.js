import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { replaceCoverDesign, normalizeMyCovers } from '../src/diary/utils/myLibrary.js'
import { newDiaryCover } from '../src/diary/utils/coverDesign.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('603: 내 표지 편집은 꾸밈까지 저장하고 이름 · 방향 · 만든 날짜는 그대로 둔다', () => {
  const base = newDiaryCover()
  const [entry] = normalizeMyCovers([{ id: 'c1', name: '봄', orientation: 'landscape', createdAt: '2026-11-07T00:00:00.000Z', cover: { ...base, band: { ...base.band, on: false } } }])
  const edited = { ...entry.cover, band: { ...entry.cover.band, on: true }, title: { ...entry.cover.title, text: '여름 기록', useName: false } }
  const [next] = replaceCoverDesign([entry], 'c1', edited)
  assert.equal(next.cover.band.on, true)
  assert.equal(next.cover.title.text, '여름 기록')
  assert.deepEqual([next.id, next.name, next.orientation, next.createdAt], ['c1', '봄', 'landscape', '2026-11-07T00:00:00.000Z'])
  assert.deepEqual(replaceCoverDesign([entry], 'other', edited), [entry])
})

test('603: 공방 표지 견본을 누르면 표지 편집을 열고, 저장은 updateCover 로 한다', () => {
  const studio = read('../src/diary/screens/DecorationStudioScreen.js')
  assert.match(studio, /<StudioShelf kind="cover" items=\{library\.covers\} onOpen=\{setCoverEdit\}/)
  assert.match(studio, /onSave=\{cover => library\.updateCover\(coverEdit\.id, cover\)\}/)
  assert.match(read('../src/diary/components/StudioShelf.js'), /`\$\{label\} 표지 편집`/)
  const modal = read('../src/diary/components/CoverEditModal.js')
  assert.match(modal, /<CoverOptions cover=\{cover\}/)
  assert.match(modal, /title="저장하지 않고 닫을까요\?"/)
  assert.match(read('../src/diary/hooks/useMyLibrary.js'), /updateCover: useCallback\(async \(id, cover\)/)
})

test('608: 사진 테이프 만들기에는 두께 버튼이 없고 늘 기본 두께로 만든다', () => {
  const cropper = read('../src/editor/components/panels/TapeCropper.js')
  assert.doesNotMatch(cropper, /Segmented|두께 \$\{item\.name\}/)
  assert.match(cropper, /const sizeId = TAPE_SIZES\[1\]\.id/)
})

test('603: 라벨을 처음 켤 때 제목이 비어 있으면 그때만 다이어리 이름 쓰기를 켜고, 구역 카드 한 칸은 두지 않는다', () => {
  const modal = read('../src/diary/components/CoverEditModal.js')
  assert.match(modal, /prev\.plate === 'none' && next\.plate !== 'none' && next\.title && !next\.title\.text && !next\.title\.useName/)
  assert.match(modal, /const next = withLabelTitle\(cover, proposed\);/)
  assert.match(modal, /const changed = cover !== item\.cover;/)
  assert.match(modal, /sections=\{\[\]\}/)
  assert.match(read('../src/diary/components/Workbench.js'), /\{!cards\.length \? null : sheet \?/)
  assert.match(read('../src/diary/components/StudioShelf.js'), /<CoverArt cover=\{item\.cover\} name="새 다이어리"/)
})

test('603: 편집 중 새로 고른 사진을 모두 모아 닫을 때 지우고, 저장하면 저장한 사진만 남긴다 · 저장 실패(예외 포함)는 안내한다', () => {
  const modal = read('../src/diary/components/CoverEditModal.js')
  assert.match(modal, /fresh\.current\.set\(id, next\.photo\)/)
  assert.match(modal, /const close = \(\) => \{ discardFresh\(\); onClose\(\); \};/)
  assert.match(modal, /discardFresh\(photoIdOf\(cover\)\);/)
  assert.match(modal, /try \{ done = await onSave\(cover\); \} catch \{ done = false; \}/)
})
