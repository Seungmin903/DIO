import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

// 앱 글꼴은 처음 쓰일 때 불러오므로, 글꼴을 찾는 함수(textStyle · loadedFontFamily · textStyleReady)를 그리는 중에 부르는 곳은
// 글꼴이 늦게 도착해도 다시 그려져야 한다(useTextFont · subscribeTextFonts · 글꼴 상태 구독). 새 호출부가 이를 빠뜨리지 않게 지킨다.
const root = fileURLToPath(new URL('../src', import.meta.url))
const files = []
const walk = dir => { for (const name of readdirSync(dir)) { const path = join(dir, name); statSync(path).isDirectory() ? walk(path) : /\.js$/.test(name) && files.push(path) } }
walk(root)
const callers = files.map(path => [relative(root, path).replaceAll('\\', '/'), readFileSync(path, 'utf8')])
  .filter(([name, source]) => name !== 'editor/utils/text.js' && /\b(textStyle|loadedFontFamily|textStyleReady)\(/.test(source))

// 글꼴 상태를 구독해야 하는 파일(그리면서 글꼴을 찾는다)
const SUBSCRIBES = new Set([
  'diary/components/CoverArt.js', 'editor/components/canvas/ObjectView.js', 'editor/components/TextEditor.js', 'editor/components/TextLinkOverlay.js',
  'editor/components/TextSettings.js', 'editor/components/controls/TextFontDropdown.js', 'editor/components/canvas/RouteNodeArt.js',
  'editor/components/TextFormatStrip.js',
])
// 직접 구독하지 않아도 되는 파일과 이유
const EXEMPT = {
  'editor/components/PaperFontChips.js': '칩만 만드는 함수. 쓰는 PaperFontDropdown 이 구독한다(아래에서 확인)',
  'editor/utils/editorShapes.js': '스타일 계산 함수. 쓰는 ShapeContent · ShapeTextEditor 가 구독한다(아래에서 확인)',
  'editor/utils/exportFonts.js': '내보내기: 찍기 전에 ensureExportFonts 가 글꼴을 기다린다',
  'editor/components/PlannerPopup.js': '데일리 플래너 팝업: 속지(PageBackground)가 마루부리를 먼저 불러온 뒤 열린다',
  'diary/screens/DecorationStudioScreen.js': '내 폰트: 글꼴 파일을 따로 불러오며(refreshPersonalFonts) 지연 로딩 대상이 아니다',
  'handwriting/HandwritingStudio.js': '내 폰트(위와 같다)',
  'handwriting/library.js': '내 폰트(위와 같다)',
  'handwriting/sharedFonts.js': '공유 다이어리에서 받은 친구 폰트: 그리지 않고 이미 등록됐는지만 본다. 직접 불러온 뒤 markTextFontLoaded 로 알린다',
}
const subscribes = source => /useTextFont\(|subscribeTextFonts|textFontStateSnapshot/.test(source)
const sourceOf = name => readFileSync(join(root, name), 'utf8')

test('글꼴을 찾으며 그리는 파일은 글꼴이 늦게 와도 다시 그린다', () => {
  assert.ok(callers.length >= 10, '호출부를 찾지 못했다')
  for (const [name, source] of callers) {
    if (SUBSCRIBES.has(name)) assert.ok(subscribes(source), `${name}: 글꼴 상태를 구독해야 한다(useTextFont)`)
    else assert.ok(name in EXEMPT, `${name}: 새로 글꼴을 찾는 파일이다. 구독하거나(SUBSCRIBES) 이유를 적어 EXEMPT 에 넣는다`)
  }
  for (const name of SUBSCRIBES) assert.ok(callers.some(([caller]) => caller === name), `${name}: 더는 글꼴을 찾지 않는다. 목록에서 뺀다`)
})

test('면제한 스타일 함수를 쓰는 화면은 글꼴 상태를 구독한다', () => {
  assert.ok(subscribes(sourceOf('diary/components/PaperFontDropdown.js')), 'PaperFontDropdown')
  for (const name of ['editor/components/canvas/ShapeContent.js', 'editor/components/ShapeTextEditor.js']) assert.ok(subscribes(sourceOf(name)), name)
})
