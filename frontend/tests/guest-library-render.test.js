import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const source = readFileSync(new URL('../App.js', import.meta.url), 'utf8')
const tree = expo('@babel/parser').parse(source, { sourceType: 'module', plugins: ['jsx'] })
const effects = []
function visit(node) {
  if (!node || typeof node !== 'object') return
  if (node.type === 'CallExpression' && node.callee.name === 'useEffect' && node.arguments[1]?.type === 'ArrayExpression' &&
    source.slice(node.arguments[0].start, node.arguments[0].end).includes('returnDiaryId.current')) effects.push(node.arguments[1])
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') visit(value)
  }
}
visit(tree)
assert.equal(effects.length, 1)
const dependencies = new Function('member', 'memberLibraryMatches', 'diaryState', 'libraryDiaries', 'libraryMetadata', 'librarySort', 'page', 'visibleDiaries',
  `return (${source.slice(effects[0].start, effects[0].end)})`)
test('게스트의 회원 보관함 없는 상태에서도 홈 복귀 effect 의존성을 평가할 수 있다', () => {
  const values = dependencies(false, false, { source: 'guest', diaries: [] }, [], {}, 'updated', 'library', [])
  assert.equal(values[2], undefined); assert.equal(values[3], undefined)
})
test('회원 보관함 ready·loading 변경은 계속 effect 재실행 의존성에 반영된다', () => {
  const values = library => dependencies(true, true, { library }, [], {}, 'updated', 'library', [])
  assert.deepEqual(values({ ready: false, loading: true }).slice(2, 4), [false, true])
  assert.deepEqual(values({ ready: true, loading: false }).slice(2, 4), [true, false])
})
