import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const studio = read('../src/diary/screens/DecorationStudioScreen.js')

test('602: 표지 사진 자르기에 세로 · 가로를 두고, 바꾸면 그 비율로 틀을 다시 잡으며 고른 방향으로 저장한다', () => {
  assert.match(studio, /setCoverCrop\(\{ photo, orientation: pdfOrientation\(photo\.aspect\), resolve \}\)/)
  assert.match(studio, /bodyKey=\{coverCrop\.orientation\}/)
  assert.match(studio, /fixedAspect=\{COVER_PHOTO_RATIO\[coverCrop\.orientation\]\}/)
  assert.match(studio, /items=\{\[\{ id: 'portrait', label: '세로' \}, \{ id: 'landscape', label: '가로' \}\]\}/)
  assert.match(studio, /coverCrop\.resolve\(\{ crop, orientation: coverCrop\.orientation \}\)/)
  assert.match(studio, /const \{ crop, orientation \} = picked;/)
  // PhotoCropper 는 bodyKey 가 바뀌면 자르기 상태를 새로 시작하고(재마운트), extra 를 아래 조절 줄에 그린다
  const cropper = read('../src/editor/components/panels/PhotoCropper.js')
  assert.match(cropper, /<PhotoCropperBody key=\{bodyKey\} \{\.\.\.props\} \/>/)
  assert.match(cropper, /\{extra\}/)
})

test('601: PDF 표지는 두 쪽 이상이면 쪽을 고르고, 고른 쪽마다 표지를 하나씩 · 남은 칸 수까지만 · 쪽 순서대로 만든다', () => {
  assert.match(studio, /const room = MY_LIBRARY_LIMIT - library\.covers\.length;/)
  // 가득 차면 만들지 않고 알린다(예전 표지가 조용히 빠지지 않게)
  assert.match(studio, /if \(kind === 'cover' && coversFull\(\)\) \{ setMakeError/)
  assert.match(studio, /if \(coversFull\(\)\) \{ setMakeError\(\{ kind: 'cover', text: coversFullText \}\); return; \}/)
  assert.match(studio, /result\.pages\.length > 1\s*\? await new Promise\(resolve => setCoverPages\(/)
  assert.match(studio, /for \(const index of \[\.\.\.chosen\]\.reverse\(\)\)/)
  assert.match(studio, /pages: result\.pages\.filter\(\(_, index\) => !savedIndexes\.has\(index\)\)/)
  assert.match(studio, /표지 \$\{chosen\.length\}개 중 \$\{savedIndexes\.size\}개만 만들었어요\./)
  const picker = read('../src/diary/components/PdfCoverPagePicker.js')
  assert.match(picker, /useState\(\(\) => new Set\(\[0\]\)\)/)
  assert.match(picker, /else if \(next\.size < limit\) next\.add\(index\)/)
  assert.match(picker, /label=\{`표지 \$\{picked\.size\}개 만들기`\} disabled=\{!picked\.size\}/)
  // 쪽이 많아도 보이는 줄만 그리고, 쪽마다 고해상도로 다시 그리지 않는다
  assert.match(picker, /<FlatList key=\{columns\} data=\{pages\} numColumns=\{columns\} extraData=\{picked\}/)
  assert.match(picker, /raster=\{false\}/)
  assert.match(read('../src/diary/components/PdfImport.js'), /usePdfPageRaster\(sharp \? page\?\.pdfSource : null\)/)
})

test('616: 공방 구역 제목이 길어도 오른쪽 버튼 자리가 바뀌지 않는다', () => {
  const section = read('../src/diary/components/StudioSection.js')
  assert.match(section, /numberOfLines=\{stacked \? undefined : 1\}/)
  assert.match(section, /head: \{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 \}/)
  assert.match(section, /right: \{ marginLeft: 'auto', flexShrink: 0,/)
})

test('593 · 594: 폰 공방 탭은 끝 여백 없이 선 끝에서 끝나고, 묶음 머리줄 · 선 · 팔레트 편집은 칸 전체 폭', () => {
  assert.match(read('../src/diary/components/StudioTabs.js'), /rowScrollCompact: \{ gap: GAP_COMPACT, paddingRight: 0 \}/)
  const presets = read('../src/diary/components/StudioPresets.js')
  assert.match(presets, /cardCompact: \{ width: '100%' \}/)
  assert.match(presets, /\[local\.line, full && local\.lineFull\]/)
  assert.match(presets, /title=\{group\.label\} full=\{compact\}/)
  assert.match(read('../src/diary/components/StudioPaperStyle.js'), /<GroupHead icon=\{icon\} title=\{title\} full=\{compact\} \/>/)
})

test('609: 알림 화면 머리줄 · 목록 좌우 24, 오른쪽 끝 버튼은 보이는 끝을 여백에 맞춘다', () => {
  const panel = read('../src/notifications/NotificationPanel.js')
  assert.match(panel, /trailing && \(text === null \? s\.trailingIcon : s\.trailingText\)/)
  assert.match(panel, /label="모두 읽음" quiet trailing style=\{s\.snug\}/)
  assert.match(panel, /snug: \{ paddingLeft: 0 \}/)
  assert.match(panel, /toolActions: \{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' \}/)
  assert.match(read('../src/notifications/AuthenticatedNotificationDialog.js'), /header: \{ paddingHorizontal: 24,/)
})

test('폴더 이름은 12자: 공방 입력칸과 저장 함수가 같은 한도를 쓴다', () => {
  const decor = read('../src/editor/hooks/useCustomDecor.js')
  assert.match(decor, /export const FOLDER_NAME_LIMIT = 12/)
  assert.equal((decor.match(/name: folderName\(name\)/g) || []).length, 4)
  assert.match(decor, /const cleanName = folderName\(name\)/)
  assert.match(decor, /Array\.from\(String\(name \?\? ''\)\.trim\(\)\)\.slice\(0, FOLDER_NAME_LIMIT\)\.join\(''\)/)
  assert.equal((studio.match(/maxLength=\{FOLDER_NAME_LIMIT\}/g) || []).length, 2)
  // 편집기 보관함 · 시트 분리 · 오리기 입력칸도 같은 한도
  for (const [path, count] of [['DecorDrawer', 2], ['StickerSplitModal', 1], ['StickerCutoutModal', 1]]) {
    const source = read(`../src/editor/components/panels/${path}.js`)
    assert.equal((source.match(/maxLength=\{FOLDER_NAME_LIMIT\}/g) || []).length, count, path)
    assert.doesNotMatch(source, /maxLength=\{12\}/, path)
  }
})

test('스티커 폴더 미리보기는 늘어난 칸을 같은 크기 칸으로 채워 좌우 안쪽 여백을 같게 둔다', () => {
  assert.match(studio, /const previewCount = Math\.max\(1, Math\.floor\(\(previewInner \+ PREVIEW_GAP\) \/ \(PREVIEW_MIN \+ PREVIEW_GAP\)\)\);/)
  assert.match(studio, /Array\.from\(\{ length: previewCount \}/)
})

test('알림 창은 불러오는 동안 목록 위에 줄을 끼워 넣지 않고, 처음엔 빈 화면 자리에 스피너만 둔다', () => {
  const panel = read('../src/notifications/NotificationPanel.js')
  assert.match(panel, /if \(quietLoading && state\.status !== 'error'\) return null;/)
  assert.equal((panel.match(/quietLoading \/>/g) || []).length, 2)
  // 처리 중 · 초대 확인 중은 줄 대신 화면 읽기 프로그램에만 알린다
  assert.doesNotMatch(panel, /<Text[^>]*>(알림을 처리하고 있어요\.|초대를 확인하고 있어요\.)/)
  assert.match(panel, /useEffect\(\(\) => \{ if \(text\) AccessibilityInfo\.announceForAccessibility\?\.\(text\); \}, \[text\]\);/)
  assert.match(panel, /<Announce text=\{working\} \/>/)
  assert.match(panel, /\(list\.status === 'idle' \|\| list\.status === 'loading'\) && items\.length === 0 && <View style=\{s\.empty\}/)
})
