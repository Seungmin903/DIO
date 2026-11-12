// 폰트 화면(HandwritingStudio)을 여는 입구는 공방(내 공간) 폰트 탭 하나다(docs/font-creation-flow.md '화면과 입력').
// 새 입구(예: 편집기 텍스트 도구)를 만들면 문서를 함께 고치고 여기에 더한다.
// HandwritingStudio 의 options.onUse('이 폰트 사용')는 입구가 넘길 때만 보이는 선택 기능이라, 지금은 넘기는 곳이 없다
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(item =>
  item.isDirectory() ? walk(join(dir, item.name)) : /\.(js|jsx|ts|tsx)$/.test(item.name) ? [join(dir, item.name)] : [])
const sources = [...walk(join(root, 'src')), join(root, 'App.js')].map(file => [relative(root, file).split(sep).join('/'), readFileSync(file, 'utf8')])

test('폰트 화면을 여는 곳은 공방 화면뿐이다', () => {
  const openers = sources.filter(([file, text]) => file !== 'src/handwriting/studioBus.js' && /\bopenFontStudio\(/.test(text)).map(([file]) => file)
  assert.deepEqual(openers, ['src/diary/screens/DecorationStudioScreen.js'])
})

test('폰트 화면에 onUse 를 넘기는 입구가 없다', () => {
  const users = sources.filter(([file, text]) => file !== 'src/handwriting/HandwritingStudio.js' && /openFontStudio\(\{[^}]*onUse/.test(text)).map(([file]) => file)
  assert.deepEqual(users, [])
})
