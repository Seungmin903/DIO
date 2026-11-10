import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as myLibrary from '../src/diary/utils/myLibrary.js'

// useMyLibrary 를 모듈 저장소 한 벌로 바꾼 뒤의 동작: 읽기 전 저장 순서, 연속 저장, 화면(훅) 사이 공유, 동기화의 replaceMyCovers.
// 훅 파일만 babel 로 옮겨 싣고, 기기 저장소 · 정리 함수는 가짜로, 목록 계산(myLibrary.js)은 진짜를 쓴다.
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const code = expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/hooks/useMyLibrary.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
const tick = () => new Promise(resolve => setImmediate(resolve))

// 아주 작은 훅 실행기: 훅 하나를 그릴 때마다 같은 자리의 상태 · 효과를 이어 쓴다
function mount(hook) {
  const states = [], deps = [], cleanups = []
  let si = 0, ei = 0, result = null
  const react = {
    useState(initial) { const i = si++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; render() }] },
    useEffect(fn, next) { const i = ei++; if (!deps[i] || next.some((v, k) => v !== deps[i][k])) { cleanups[i]?.(); deps[i] = next; cleanups[i] = fn() } },
    useCallback: fn => fn,
  }
  function render() { si = 0; ei = 0; result = hook(react) }
  render()
  return { get current() { return result }, unmount() { cleanups.forEach(cleanup => cleanup?.()) } }
}

function load({ stored = {}, failSave = () => false, slowRead = null } = {}) {
  const disk = new Map(Object.entries(stored).map(([k, v]) => [k, JSON.stringify(v)]))
  const writes = []
  const keys = { myCovers: 'covers', myPapers: 'papers' }
  let react = null
  const deps = {
    react: new Proxy({}, { get: (_, name) => react[name] }),
    '../../editor/services/documentStorage': { __esModule: true, default: {} },
    '../../editor/services/storage': {
      STORAGE_KEYS: keys,
      loadJSON: async (key, fallback) => { if (slowRead) await slowRead; return disk.has(key) ? JSON.parse(disk.get(key)) : fallback },
      saveJSON: async (key, value) => { await tick(); if (failSave(key, value)) return false; disk.set(key, JSON.stringify(value)); writes.push([key, value.map(item => item.id)]); return true },
    },
    '../../editor/utils/mediaReferences': { collectMediaIds: () => [] },
    '../../editor/utils/mediaRepository': { remove: async () => {} },
    '../utils/myLibrary.js': myLibrary,
    '../utils/libraryCleanup.js': { cleanupRemovedEntry: async () => {} },
    '../utils/pdfSource.js': { collectPdfSourceIds: () => [] },
    '../utils/pdfSourceStore': { removePdfSource: async () => {} },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => { if (!(id in deps)) throw Error(`unexpected import ${id}`); return deps[id] }, module, module.exports)
  const lib = module.exports
  return {
    lib, disk, writes,
    mountHook: () => mount(r => { react = r; return lib.default() }),
  }
}
const cover = (id, name = id) => ({ id, name, createdAt: '2026-11-10T00:00:00.000Z', orientation: 'portrait', cover: { kind: 'plain', color: '#112233' } })
const ids = list => list.map(item => item.id)

test('읽기가 끝나기 전에 들어온 저장은 읽은 목록 위에 얹는다(빈 목록으로 덮어쓰지 않는다)', async () => {
  let release
  const slowRead = new Promise(resolve => { release = resolve })
  const { lib, disk, mountHook } = load({ stored: { covers: [cover('old')] }, slowRead })
  const hook = mountHook()
  assert.equal(hook.current.ready, false)
  const adding = hook.current.addCover({ name: '읽기 전에 만든 표지', orientation: 'portrait', cover: {} }) // 아직 읽는 중
  // 동기화가 읽기 전 목록(빈 목록)을 base 로 보고 바꾸려 해도, 읽은 뒤에는 base 가 달라 거절된다
  const replacing = lib.replaceMyCovers([cover('x')], [])
  release()
  assert.equal(await adding, true)
  assert.equal(await replacing, null)
  assert.deepEqual(hook.current.covers.map(item => item.name), ['읽기 전에 만든 표지', 'old'])
  assert.deepEqual(JSON.parse(disk.get('covers')).map(item => item.name), ['읽기 전에 만든 표지', 'old'])
  hook.unmount()
})

test('훅으로 빠르게 두 번 저장해도 둘 다 남고, 두 화면(훅)이 같은 목록을 본다', async () => {
  const { lib, disk, mountHook } = load({ stored: { covers: [cover('old')] } })
  const studio = mountHook(), create = mountHook()
  await tick(); await tick()
  assert.equal(studio.current.ready, true)
  assert.deepEqual(ids(create.current.covers), ['old'])
  const first = studio.current.addCover({ name: '하나', orientation: 'portrait', cover: { kind: 'plain' } })
  const second = create.current.addCover({ name: '둘', orientation: 'landscape', cover: { kind: 'plain' } })
  assert.deepEqual(await Promise.all([first, second]), [true, true])
  assert.deepEqual(studio.current.covers.map(item => item.name), ['둘', '하나', 'old'])
  assert.equal(create.current.covers, studio.current.covers) // 같은 목록 한 벌
  assert.deepEqual(JSON.parse(disk.get('covers')).map(item => item.name), ['둘', '하나', 'old'])
  // 이름 바꾸기 · 지우기도 다른 화면에 그대로 보인다
  const id = studio.current.covers[0].id
  assert.equal(await create.current.renameCover(id, '바꾼 이름'), true)
  assert.equal(studio.current.covers[0].name, '바꾼 이름')
  assert.equal(await studio.current.removeCover(id), true)
  assert.deepEqual(create.current.covers.map(item => item.name), ['하나', 'old'])
  studio.unmount(); create.unmount()
  assert.deepEqual(ids(lib.myCoversSnapshot()), ids(JSON.parse(disk.get('covers'))))
})

test('기기 저장에 실패하면 목록을 바꾸지 않고 false', async () => {
  const { mountHook } = load({ stored: { covers: [cover('old')] }, failSave: () => true })
  const hook = mountHook()
  await tick(); await tick()
  assert.equal(await hook.current.addCover({ name: '새', orientation: 'portrait', cover: {} }), false)
  assert.deepEqual(ids(hook.current.covers), ['old'])
})

test('replaceMyCovers: base 가 지금 목록이면 바꾸고 적용한 목록을, 그 사이 사용자가 고쳤으면 null 을 돌려준다', async () => {
  const { lib, mountHook } = load({ stored: { covers: [cover('old')] } })
  const hook = mountHook()
  const notified = []
  const off = lib.subscribeMyLibrary(() => notified.push(ids(lib.myCoversSnapshot())))
  await lib.myCoversReady()
  const base = lib.myCoversSnapshot()
  const applied = await lib.replaceMyCovers([cover('s1'), cover('s2')], base)
  assert.deepEqual(ids(applied), ['s1', 's2'])
  assert.equal(lib.myCoversSnapshot(), applied)
  assert.deepEqual(ids(hook.current.covers), ['s1', 's2']) // 열린 화면에도 보인다
  // 서버 목록을 받는 동안 사용자가 표지를 추가했다: 받기 전에 본 목록(stale)으로는 바꾸지 않는다
  const stale = lib.myCoversSnapshot()
  await hook.current.addCover({ name: '방금 만든 표지', orientation: 'portrait', cover: {} })
  assert.equal(await lib.replaceMyCovers([cover('server')], stale), null)
  assert.deepEqual(hook.current.covers.map(item => item.name), ['방금 만든 표지', 's1', 's2'])
  off()
  const before = notified.length
  await lib.replaceMyCovers([cover('z')], lib.myCoversSnapshot())
  assert.equal(notified.length, before) // 구독을 끊으면 더 불리지 않는다
  hook.unmount()
})

test('replaceMyPapers: 내 속지도 base 가 지금 목록이면 바꾸고 적용한 목록을, 그 사이 사용자가 고쳤으면 null 을 돌려준다', async () => {
  const paper = (id, name = id) => ({ id, name, createdAt: '2026-11-10T00:00:00.000Z', orientation: 'portrait', pages: [{ src: 'media:x', mediaFileId: 'x', aspect: 1, name: 'PDF' }] })
  const { lib, mountHook } = load({ stored: { papers: [paper('old')] } })
  const hook = mountHook()
  await lib.myPapersReady()
  const applied = await lib.replaceMyPapers([paper('s1')], lib.myPapersSnapshot())
  assert.deepEqual(ids(applied), ['s1'])
  assert.equal(lib.myPapersSnapshot(), applied)
  assert.deepEqual(ids(hook.current.papers), ['s1'])
  const stale = lib.myPapersSnapshot()
  await hook.current.addPaper({ name: '방금 만든 속지', orientation: 'portrait', pages: [{ src: 'media:y', mediaFileId: 'y', aspect: 1, name: 'PDF' }] })
  assert.equal(await lib.replaceMyPapers([paper('server')], stale), null)
  assert.deepEqual(hook.current.papers.map(item => item.name), ['방금 만든 속지', 's1'])
  hook.unmount()
})
