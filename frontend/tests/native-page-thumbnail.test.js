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
  const objects = Array.from({ length: 30 }, (_, id) => ({ id }))
  assert.deepEqual(render({ objects }), [])
  flush(); assert.deepEqual(render({ objects }), [0, 1, 2])
  // 처음 채울 때는 3 → 6 → 12 → 24 처럼 두 배씩 보탠다
  flush(); assert.equal(render({ objects }).length, 6)
  const appended = [...objects, { id: 30 }]
  assert.equal(render({ objects: appended }).length, 6)
  const scheduledBefore = [...timers.keys()][0]
  const appendedAgain = [...appended, { id: 31 }]
  assert.equal(render({ objects: appendedAgain }).length, 6)
  assert.equal([...timers.keys()][0], scheduledBefore)
  flush(); assert.equal(render({ objects: appendedAgain }).length, 12)
  const replacement = [{ id: 'new' }]
  assert.deepEqual(render({ objects: replacement }), [])
  assert.equal(timers.size, 1)
  flush(); assert.deepEqual(render({ objects: replacement }), ['new'])
  const next = Array.from({ length: 9 }, (_, id) => ({ id }))
  render({ objects: next }); effects.forEach(effect => effect?.cleanup?.()); assert.equal(timers.size, 0)
})

test('다 채워진 썸네일에 획이 더해지면 모았다가 한 번에 보태고, 그동안 미리보기 객체는 그대로 둔다', () => {
  let state, nextId = 0, refIndex = 0, effectIndex = 0
  const refs = [], effects = [], pendingEffects = [], timers = new Map(), delays = []
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
  const schedule = (fn, delay) => { const id = ++nextId; timers.set(id, fn); delays.push(delay); return id }
  const cancel = id => timers.delete(id)
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', code)(load, module, module.exports, schedule, cancel)
  const render = page => { refIndex = 0; effectIndex = 0; const result = module.exports.default({ page, zoom: 0.2 }).props.page; pendingEffects.splice(0).forEach(run => run()); return result }
  const flush = () => { const [id, fn] = timers.entries().next().value; timers.delete(id); fn() }
  const objects = Array.from({ length: 4 }, (_, id) => ({ id }))
  const page = { id: 'p', objects }
  render(page); flush(); render(page); flush()
  const filled = render(page)
  assert.deepEqual(filled.objects.map(o => o.id), [0, 1, 2, 3]); assert.equal(filled, page, '다 보이면 페이지 객체 그대로')
  assert.equal(timers.size, 0)
  const one = { id: 'p', objects: [...objects, { id: 4 }] }
  const held = render(one)
  assert.equal(held, page, '새 획이 빠진 미리보기는 직전 미리보기 객체를 다시 쓴다(StaticPage memo 유지)')
  assert.equal(timers.size, 1); assert.equal(delays.at(-1), module.exports.UPDATE_DELAY_MS)
  const two = { id: 'p', objects: [...one.objects, { id: 5 }] }
  assert.equal(render(two), page); assert.equal(timers.size, 1, '연속 입력은 타이머를 다시 잡아 하나만 둔다')
  flush()
  assert.deepEqual(render(two).objects.map(o => o.id), [0, 1, 2, 3, 4, 5], '모았던 요소를 한 번에 보탠다')
  assert.equal(timers.size, 0)
  // 입력이 300ms 보다 촘촘히 이어져도 최대 대기 시간을 넘기면 바로 보탠다
  const realNow = Date.now; let clock = realNow()
  Date.now = () => clock
  try {
    let page2 = two
    for (let i = 7; i < 12; i++) { clock += 150; page2 = { id: 'p', objects: [...page2.objects, { id: i }] }; render(page2) }
    assert.equal(timers.size, 1, '디바운스 중')
    clock += 400; page2 = { id: 'p', objects: [...page2.objects, { id: 12 }] }
    render(page2); assert.equal(timers.size, 0, '타이머 없이 바로 보탠다'); assert.equal(render(page2).objects.length, 12, '최대 대기 시간을 넘기면 전부 보탠다')
    var twoTail = page2
  } finally { Date.now = realNow }
  // 내용이 통째로 바뀌어 안 보인 요소가 많으면 모으지 않고 처음처럼 나눠 그린다. 걸려 있던 모으기 타이머는 취소한다
  const three = { id: 'p', objects: [...twoTail.objects, { id: 'x' }] }
  render(three); assert.equal(timers.size, 1); assert.equal(delays.at(-1), module.exports.UPDATE_DELAY_MS)
  const replaced = { id: 'p', objects: Array.from({ length: 30 }, (_, i) => ({ id: `r${i}` })) }
  assert.deepEqual(render(replaced).objects, [])
  assert.equal(timers.size, 1, '모으기 타이머를 취소하고 나눠 그리기 하나만 둔다'); assert.notEqual(delays.at(-1), module.exports.UPDATE_DELAY_MS)
  flush(); assert.equal(render(replaced).objects.length, 3)
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

test('취소된 썸네일 작업은 시간 슬롯을 차지하지 않고 정리 후 큐를 재사용한다', async () => {
  const { createThumbnailWorkQueue } = await import('../src/editor/utils/thumbnailWorkQueue.js')
  let nextId = 0
  const timers = new Map(), seen = []
  const queue = createThumbnailWorkQueue({ schedule: fn => { const id = ++nextId; timers.set(id, fn); return id }, cancel: id => timers.delete(id) })
  const cancelFirst = queue.enqueue(() => seen.push('cancelled'))
  queue.enqueue(() => seen.push('next'))
  cancelFirst()
  assert.equal(timers.size, 1)
  let [id, fn] = timers.entries().next().value; timers.delete(id); fn()
  assert.deepEqual(seen, ['next'])
  queue.enqueue(() => seen.push('cleared'))
  queue.clear()
  assert.equal(timers.size, 0)
  queue.enqueue(() => seen.push('reused'))
  ;[id, fn] = timers.entries().next().value; timers.delete(id); fn()
  assert.deepEqual(seen, ['next', 'reused'])
})
