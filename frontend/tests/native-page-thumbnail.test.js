import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as thumbnailProgress from '../src/editor/utils/thumbnailProgress.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/panels/PageThumbnail.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

test('네이티브 썸네일은 요소 순서를 유지해 나눠 그리고 변경·닫기 후 이전 작업을 취소한다', () => {
  let state, nextId = 0, refIndex = 0, effectIndex = 0
  const refs = [], effects = [], pendingEffects = [], timers = new Map()
  const mockReact = {
    useState: initial => { if (!state) state = initial(); return [state, value => { state = value }] },
    useRef: initial => refs[refIndex++] ??= { current: initial },
    useMemo: fn => fn(),
    useEffect: (effect, deps) => {
      const index = effectIndex++, old = effects[index]
      if (!old || deps.some((value, i) => value !== old.deps[i])) pendingEffects.push(() => { old?.cleanup?.(); effects[index] = { deps, cleanup: effect() } })
    },
  }
  const module = { exports: {} }
  const load = id => id === 'react' ? mockReact : id === '../canvas/StaticPage' ? { __esModule: true, default: 'page' } : id === '../../utils/thumbnailProgress.js' ? thumbnailProgress : require(id)
  const schedule = fn => { const id = ++nextId; timers.set(id, fn); return id }
  const cancel = id => timers.delete(id)
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', code)(load, module, module.exports, schedule, cancel)
  const render = page => { refIndex = 0; effectIndex = 0; const result = module.exports.default({ page, zoom: 0.2 }).props.page.objects.map(item => item.id); pendingEffects.splice(0).forEach(run => run()); return result }
  const flush = () => { const [id, fn] = timers.entries().next().value; timers.delete(id); fn() }
  const objects = Array.from({ length: 14 }, (_, id) => ({ id }))
  assert.deepEqual(render({ objects }), [])
  flush(); assert.deepEqual(render({ objects }), [0, 1, 2])
  flush(); assert.equal(render({ objects }).length, 6)
  const appended = [...objects, { id: 14 }]
  assert.equal(render({ objects: appended }).length, 6)
  const scheduledBefore = [...timers.keys()][0]
  const appendedAgain = [...appended, { id: 15 }]
  assert.equal(render({ objects: appendedAgain }).length, 6)
  assert.equal([...timers.keys()][0], scheduledBefore)
  flush(); assert.equal(render({ objects: appendedAgain }).length, 9)
  const replacement = [{ id: 'new' }]
  assert.deepEqual(render({ objects: replacement }), [])
  assert.equal(timers.size, 1)
  flush(); assert.deepEqual(render({ objects: replacement }), ['new'])
  const next = Array.from({ length: 9 }, (_, id) => ({ id }))
  render({ objects: next }); effects.forEach(effect => effect?.cleanup?.()); assert.equal(timers.size, 0)
})

 test('썸네일 대기열은 페이지 작업을 순서대로 실행하고 닫으면 예약 작업을 중단한다', async () => {
  const { createThumbnailWorkQueue } = await import('../src/editor/utils/thumbnailWorkQueue.js')
  let nextId = 0
  const timers = new Map(), seen = []
  const queue = createThumbnailWorkQueue({
    schedule: fn => { const id = ++nextId; timers.set(id, fn); return id },
    cancel: id => timers.delete(id),
  })
  const flush = () => { const [id, fn] = timers.entries().next().value; timers.delete(id); fn() }
  queue.enqueue(() => { seen.push('a'); queue.enqueue(() => seen.push('a2')) })
  queue.enqueue(() => seen.push('b'))
  assert.equal(timers.size, 1)
  flush(); assert.deepEqual(seen, ['a'])
  flush(); assert.deepEqual(seen, ['a', 'b'])
  queue.stop(); assert.equal(timers.size, 0)
  queue.enqueue(() => seen.push('late'))
  assert.deepEqual(seen, ['a', 'b'])
  assert.equal(timers.size, 0)
})
