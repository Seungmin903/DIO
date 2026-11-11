import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

// useDefaultPaperStyle 모듈 저장소: 읽기 전 저장 순서, 연속 저장, 화면(훅) 사이 공유, 저장 실패 시 유지, null 로 되돌리기, 동기화의 replaceDefaultPaperStyle.
// 훅 파일만 babel 로 옮겨 싣고, 기기 저장소와 속지 모양 정규화는 가짜로 쓴다.
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const code = expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/hooks/useDefaultPaperStyle.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
const tick = () => new Promise(resolve => setImmediate(resolve))
const KEY = 'defaultPaperStyle'
const DEFAULT = { backgroundColor: '#FFFFFF', layoutColor: '#292929' }
const normalize = value => ({ backgroundColor: value?.backgroundColor ?? '#FFFFFF', layoutColor: value?.layoutColor ?? '#292929', ...(value?.font ? { font: value.font } : {}) })

// 아주 작은 훅 실행기: 훅 하나를 그릴 때마다 같은 자리의 상태 · 효과 · 메모를 이어 쓴다
function mount(hook) {
  const states = [], deps = [], cleanups = [], memos = []
  let si = 0, ei = 0, mi = 0, result = null
  const changed = (before, next) => !before || next.some((v, k) => v !== before[k])
  const react = {
    useState(initial) { const i = si++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; render() }] },
    useEffect(fn, next) { const i = ei++; if (changed(deps[i], next)) { cleanups[i]?.(); deps[i] = next; cleanups[i] = fn() } },
    useMemo(fn, next) { const i = mi++; if (changed(memos[i]?.deps, next)) memos[i] = { deps: next, value: fn() }; return memos[i].value },
    useCallback: fn => fn,
  }
  function render() { si = 0; ei = 0; mi = 0; result = hook(react) }
  render()
  return { get current() { return result }, unmount() { cleanups.forEach(cleanup => cleanup?.()) } }
}

function load({ stored, failSave = () => false, failRemove = false, slowRead = null } = {}) {
  const disk = new Map(stored === undefined ? [] : [[KEY, JSON.stringify(stored)]])
  const calls = []
  let react = null
  const deps = {
    react: new Proxy({}, { get: (_, name) => react[name] }),
    '../../editor/services/storage': {
      STORAGE_KEYS: { defaultPaperStyle: KEY },
      loadJSON: async (key, fallback) => { if (slowRead) await slowRead; return disk.has(key) ? JSON.parse(disk.get(key)) : fallback },
      saveJSON: async (key, value) => { await tick(); calls.push(['save', value.backgroundColor]); if (failSave(value)) return false; disk.set(key, JSON.stringify(value)); return true },
      removeJSON: async key => { await tick(); calls.push(['remove']); if (failRemove) return false; disk.delete(key); return true },
    },
    '../../editor/templates/appearance.js': { DEFAULT_PAPER_APPEARANCE: DEFAULT, normalizePaperAppearance: normalize },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => { if (!(id in deps)) throw Error(`unexpected import ${id}`); return deps[id] }, module, module.exports)
  const lib = module.exports
  return { lib, disk, calls, mountHook: () => mount(r => { react = r; return lib.default() }) }
}
const stored = disk => (disk.has(KEY) ? JSON.parse(disk.get(KEY)) : undefined)

test('고른 적이 없으면 원래 기본값을 보이고 snapshot 은 null', async () => {
  const { lib, mountHook } = load()
  const hook = mountHook()
  assert.equal(hook.current.ready, false)
  await lib.defaultPaperStyleReady(); await tick()
  assert.equal(hook.current.ready, true)
  assert.deepEqual(hook.current.style, DEFAULT)
  assert.equal(lib.defaultPaperStyleSnapshot(), null)
  assert.deepEqual(await lib.loadDefaultPaperStyle(), DEFAULT)
  hook.unmount()
})

test('읽기가 끝나기 전에 들어온 저장은 읽은 뒤에 얹고, 읽기 전 값을 base 로 본 동기화는 거절된다', async () => {
  let release
  const slowRead = new Promise(resolve => { release = resolve })
  const { lib, disk, mountHook } = load({ stored: { backgroundColor: '#111111', layoutColor: '#222222' }, slowRead })
  const hook = mountHook()
  const saving = hook.current.save({ backgroundColor: '#333333', layoutColor: '#444444' }) // 아직 읽는 중
  const replacing = lib.replaceDefaultPaperStyle({ backgroundColor: '#999999' }, null) // 읽기 전 값(null)을 base 로 봄
  release()
  assert.equal(await saving, true)
  assert.equal(await replacing, null)
  assert.equal(hook.current.style.backgroundColor, '#333333')
  assert.equal(stored(disk).backgroundColor, '#333333')
  hook.unmount()
})

test('빠르게 두 번 저장하면 누른 차례대로 저장되고, 두 화면(훅)이 같은 값을 본다', async () => {
  const { lib, disk, calls, mountHook } = load()
  const studio = mountHook(), other = mountHook()
  await lib.defaultPaperStyleReady(); await tick()
  const first = studio.current.save({ backgroundColor: '#AAAAAA', layoutColor: '#000000' })
  const second = other.current.save({ backgroundColor: '#BBBBBB', layoutColor: '#000000' })
  assert.deepEqual(await Promise.all([first, second]), [true, true])
  assert.deepEqual(calls, [['save', '#AAAAAA'], ['save', '#BBBBBB']])
  assert.equal(stored(disk).backgroundColor, '#BBBBBB')
  assert.equal(studio.current.style.backgroundColor, '#BBBBBB')
  assert.equal(other.current.style.backgroundColor, '#BBBBBB')
  studio.unmount(); other.unmount()
})

test('기기 저장에 실패하면 화면 값과 snapshot 을 바꾸지 않고 false, 다음 저장은 이어서 된다', async () => {
  const { lib, disk, mountHook } = load({ stored: { backgroundColor: '#111111', layoutColor: '#222222' }, failSave: value => value.backgroundColor === '#BAD000' })
  const hook = mountHook()
  await lib.defaultPaperStyleReady(); await tick()
  const before = lib.defaultPaperStyleSnapshot()
  assert.equal(await hook.current.save({ backgroundColor: '#BAD000', layoutColor: '#222222' }), false)
  assert.equal(lib.defaultPaperStyleSnapshot(), before)
  assert.equal(hook.current.style.backgroundColor, '#111111')
  assert.equal(stored(disk).backgroundColor, '#111111')
  assert.equal(await hook.current.save({ backgroundColor: '#123456', layoutColor: '#222222' }), true)
  assert.equal(hook.current.style.backgroundColor, '#123456')
  hook.unmount()
})

test('replaceDefaultPaperStyle: base 가 지금 값이면 바꾸고 { style } 을, 그 사이 사용자가 고쳤으면 null 을 돌려준다', async () => {
  const { lib, disk, mountHook } = load({ stored: { backgroundColor: '#111111', layoutColor: '#222222' } })
  const hook = mountHook()
  const notified = []
  const off = lib.subscribeDefaultPaperStyle(() => notified.push(lib.defaultPaperStyleSnapshot()))
  await lib.defaultPaperStyleReady()
  const result = await lib.replaceDefaultPaperStyle({ backgroundColor: '#ABCDEF', layoutColor: '#222222', font: 'f1' }, lib.defaultPaperStyleSnapshot())
  assert.deepEqual(result, { style: { backgroundColor: '#ABCDEF', layoutColor: '#222222', font: 'f1' } })
  assert.equal(lib.defaultPaperStyleSnapshot(), result.style)
  assert.equal(hook.current.style.font, 'f1') // 열린 화면에도 보인다
  // 서버 값을 받는 동안 사용자가 스타일을 바꿨다: 받기 전에 본 값(stale)으로는 바꾸지 않는다
  const stale = lib.defaultPaperStyleSnapshot()
  await hook.current.save({ backgroundColor: '#FEDCBA', layoutColor: '#222222' })
  assert.equal(await lib.replaceDefaultPaperStyle({ backgroundColor: '#000000' }, stale), null)
  assert.equal(hook.current.style.backgroundColor, '#FEDCBA')
  assert.equal(stored(disk).backgroundColor, '#FEDCBA')
  off()
  const before = notified.length
  await lib.replaceDefaultPaperStyle({ backgroundColor: '#010101' }, lib.defaultPaperStyleSnapshot())
  assert.equal(notified.length, before) // 구독을 끊으면 더 불리지 않는다
  hook.unmount()
})

test('replaceDefaultPaperStyle(null) 은 기기 값을 지워(removeJSON) 고른 적 없음으로 되돌리고, 지우기에 실패하면 그대로 둔다', async () => {
  const kept = load({ stored: { backgroundColor: '#111111', layoutColor: '#222222' }, failRemove: true })
  await kept.lib.defaultPaperStyleReady()
  const before = kept.lib.defaultPaperStyleSnapshot()
  assert.equal(await kept.lib.replaceDefaultPaperStyle(null, before), null)
  assert.equal(kept.lib.defaultPaperStyleSnapshot(), before)
  assert.equal(stored(kept.disk).backgroundColor, '#111111')

  const { lib, disk, calls, mountHook } = load({ stored: { backgroundColor: '#111111', layoutColor: '#222222' } })
  const hook = mountHook()
  await lib.defaultPaperStyleReady(); await tick()
  assert.deepEqual(await lib.replaceDefaultPaperStyle(null, lib.defaultPaperStyleSnapshot()), { style: null })
  assert.deepEqual(calls, [['remove']])
  assert.equal(disk.has(KEY), false)
  assert.equal(lib.defaultPaperStyleSnapshot(), null)
  assert.deepEqual(hook.current.style, DEFAULT)
  hook.unmount()
})
