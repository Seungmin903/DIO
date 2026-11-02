import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/hooks/useProgressiveNativePage.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

test('페이지 전환은 입력 준비 전 요소를 나눠 표시하고 빠른 재전환 때 이전 작업을 취소한다', () => {
  let state, ref, previousDeps, cleanup, nextId = 0, pending = []
  const timers = new Map(), all = new Map()
  const react = {
    useState: initial => { if (!state) state = initial(); return [state, value => { state = value }] },
    useRef: value => ref ??= { current: value },
    useEffect: (effect, deps) => { if (!previousDeps || deps.some((v, i) => v !== previousDeps[i])) pending.push(() => { cleanup?.(); previousDeps = deps; cleanup = effect() }) },
  }
  const module = { exports: {} }
  const schedule = fn => { const id = ++nextId; timers.set(id, fn); all.set(id, fn); return id }
  const cancel = id => timers.delete(id)
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', code)(id => id === 'react' ? react : require(id), module, module.exports, schedule, cancel)
  const render = (page, enabled = true) => { const result = module.exports.useProgressiveNativePage(page, enabled); pending.splice(0).forEach(fn => fn()); return result }
  const flush = () => { const [id, fn] = timers.entries().next().value; timers.delete(id); fn() }
  const a = { id: 'a', objects: [{ id: 1 }] }, b = { id: 'b', objects: Array.from({ length: 25 }, (_, id) => ({ id })) }, c = { id: 'c', objects: [{ id: 'new' }] }
  assert.deepEqual(render(a), { count: 1, ready: true })
  assert.deepEqual(render(b), { count: 0, ready: false })
  flush(); assert.deepEqual(render(b), { count: 8, ready: false })
  const stale = [...timers.keys()][0]
  assert.deepEqual(render(c), { count: 0, ready: false })
  all.get(stale)()
  assert.deepEqual(render(c), { count: 0, ready: false })
  flush(); assert.deepEqual(render(c), { count: 1, ready: true })
  assert.equal(b.objects.length, 25)
  assert.deepEqual(render(b, false), { count: 25, ready: true })
  cleanup?.()
})
