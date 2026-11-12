// 폰트 화면(HandwritingStudio)을 여는 입구는 공방(내 공간) 폰트 탭 하나다(docs/font-creation-flow.md '화면과 입력').
// 새 입구(예: 편집기 텍스트 도구)를 만들면 문서를 함께 고치고 여기에 더한다.
//
// 호출 문자열 대신 studioBus 를 **가져오는 문(import · export … from)** 으로 본다: 별칭(openFontStudio as x),
// 묶음(import * as bus), 다시 내보내기(export { openFontStudio } from)도 잡는다.
// 동적 import(await import('…/studioBus'))나 require 는 앱 코드에서 쓰지 않으므로 보지 않는다.
//
// 입구가 넘기는 옵션(onUse 를 넘기지 않는지)은 문자열로 보지 않고, 공방 화면을 실제로 그려 넘긴 값을
// 그대로 비교하는 decoration-studio.test.js('폰트 추가' → { create: true }, 항목 → { open: id })가 맡는다.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(item =>
  item.isDirectory() ? walk(join(dir, item.name)) : /\.(js|jsx|ts|tsx)$/.test(item.name) ? [join(dir, item.name)] : [])
const sources = [...walk(join(root, 'src')), join(root, 'App.js')].map(file => [relative(root, file).split(sep).join('/'), readFileSync(file, 'utf8')])

// studioBus 에서 가져오거나 다시 내보내는 문 하나하나: { file, names(가져온 이름들, 묶음이면 '*') }
const BUS_STATEMENT = /\b(?:import|export)\s+(\*(?:\s+as\s+[\w$]+)?|\{[^}]*\}|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+[\w$]+))?)\s+from\s+['"][^'"]*\/studioBus(?:\.js)?['"]/g
const busImports = sources.flatMap(([file, text]) => [...text.matchAll(BUS_STATEMENT)].map(match => ({
  file, names: match[1].includes('*') ? ['*'] : (match[1].match(/\{([\s\S]*)\}/)?.[1] ?? '').split(',').map(part => part.trim().split(/\s+as\s+/)[0]).filter(Boolean),
})))

test('studioBus 를 가져오는 문을 읽을 수 있다(검사 자체의 확인)', () => {
  assert.ok(busImports.some(({ file }) => file === 'src/handwriting/HandwritingStudio.js'))
  assert.ok(busImports.some(({ file }) => file === 'src/diary/screens/DecorationStudioScreen.js'))
})

test('폰트 화면을 여는 함수(openFontStudio)를 가져오는 곳은 공방 화면뿐이다', () => {
  const openers = busImports.filter(({ names }) => names.includes('openFontStudio') || names.includes('*')).map(({ file }) => file)
  assert.deepEqual([...new Set(openers)], ['src/diary/screens/DecorationStudioScreen.js'])
})
