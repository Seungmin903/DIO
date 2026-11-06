import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('폰 새 다이어리 · 다이어리 수정은 위 막대를 전면 카메라 아래에 둔다', () => {
  assert.match(read('App.js'), /sheet=\{isPhone\}\s+topInset=\{isPhone \? insets\.top : 0\}/)
  assert.equal(read('src/diary/screens/MockLibraryApp.js').match(/sheet=\{isPhone\} topInset=\{isPhone \? insets\.top : 0\}/g)?.length, 2)
  assert.match(read('src/diary/components/DiaryCreateModal.js'), /topInset=\{topInset\}/)
  assert.match(read('src/diary/components/Workbench.js'), /paddingTop: topInset/)
})

test('전체 화면인 앱 잠금 · 내보내기는 위쪽 안전 영역 아래부터 그린다', () => {
  for (const file of ['src/diary/components/PinScreen.js', 'src/editor/components/ExportScreen.js']) {
    assert.match(read(file), /<SafeAreaView edges=\{\['top'\]\}/, file)
  }
})
