import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/hooks/usePageReadiness.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

test('페이지 재전환과 레이아웃 변경 시 오래된 완료는 입력 잠금을 해제하지 않는다', () => {
  let state, memo, draft
  const react = {
    useMemo: (make, deps) => {
      draft = memo && deps.every((v, i) => v === memo.deps[i]) ? memo : { deps, value: make() }
      return draft.value
    },
    useState: init => { if (state === undefined) state = init(); return [state, next => { state = next }] },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => id === 'react' ? react : require(id), module, module.exports)
  const render = (id, enabled, commit = true, startPending = false) => { const value = module.exports.usePageReadiness(id, enabled, startPending); if (commit) memo = draft; return value }
  const first = render('a', true)
  assert.equal(first.pageReady, true)
  const second = render('b', true)
  assert.equal(second.pageReady, false)
  second.setReadyPage({ id: 'b', generation: second.generation })
  assert.equal(render('b', true).pageReady, true)
  const back = render('a', true)
  assert.equal(back.pageReady, false)
  back.setReadyPage({ id: 'a', generation: first.generation })
  assert.equal(render('a', true).pageReady, false)
  back.setReadyPage({ id: 'a', generation: back.generation })
  assert.equal(render('a', true).pageReady, true)
  render('b', true, false) // 폐기된 렌더는 커밋된 세대를 바꾸지 않는다.
  assert.equal(render('a', true).pageReady, true)
  assert.equal(render('a', false).pageReady, true)
  assert.equal(render('a', true).pageReady, false)
  state = memo = undefined
  const heavy = render('heavy', true, true, true)
  assert.equal(heavy.pageReady, false)
  assert.equal(render('heavy', true, true, true).pageReady, false)
  heavy.setReadyPage({ id: 'heavy', generation: heavy.generation })
  assert.equal(render('heavy', true, true, true).pageReady, true)
})
