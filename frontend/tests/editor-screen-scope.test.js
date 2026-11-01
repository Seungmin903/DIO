import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))

test('편집 화면은 선언되지 않은 변수를 참조하지 않는다', () => {
  // Parse lexical scopes, including JSX expressions and nested callbacks. Import
  // declarations count as bindings; only these platform globals are external.
  const platformGlobals = new Set(['window', 'setTimeout', 'clearTimeout'])
  const missing = []
  expo('@babel/core').transformSync(
    readFileSync(new URL('../src/editor/screens/EditorScreen.js', import.meta.url), 'utf8'),
    {
      configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] },
      plugins: [() => ({ visitor: {
        ReferencedIdentifier(path) {
          const { name, loc } = path.node
          if (!path.scope.hasBinding(name) && !platformGlobals.has(name)) {
            missing.push(`${name}:${loc.start.line}`)
          }
        },
      } })],
    },
  )
  assert.deepEqual(missing, [], `Unbound editor variables: ${missing.join(', ')}`)
})
