import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { indexedDB } from 'fake-indexeddb'
import { collectMediaIds, createMediaRegistry, mediaId } from '../src/editor/utils/mediaReferences.js'

test('30개 이미지를 조회해도 다른 ID의 스냅샷은 변경되지 않는다', async () => {
  const registry = createMediaRegistry({ load: async (id) => ({ uri: `blob:${id}` }) })
  registry.seed('visible', { uri: 'blob:visible' })
  const visible = registry.get('visible')
  let ownSnapshotChanges = 0
  registry.subscribe(() => {
    if (!Object.is(visible, registry.get('visible'))) ownSnapshotChanges++
  })
  await Promise.all(Array.from({ length: 30 }, (_, i) => registry.ensure(`other-${i}`)))
  assert.equal(ownSnapshotChanges, 0)
  assert.equal(registry.get('visible'), visible)
})

test('ID가 src보다 우선하고 이전 media 참조·보관함을 중복 없이 수집한다', () => {
  assert.equal(mediaId({ mediaFileId: 'actual', src: 'media:stale' }), 'actual')
  assert.equal(mediaId({ src: 'media:legacy' }), 'legacy')
  assert.equal(mediaId({ src: 'data:image/png;base64,AA==' }), null)
  assert.deepEqual(collectMediaIds({
    title: 'media:not-a-file',
    pages: [{ objects: [{ mediaFileId: 'photo' }, { src: 'media:legacy' }] }],
    stickers: [{ mediaFileId: 'photo' }, { mediaFileId: 'sticker' }],
  }), ['photo', 'legacy', 'sticker'])
})

test('동시에 같은 원본을 요청해도 한 번 조회하고 늦은 중복 URL은 정리한다', async () => {
  let finish
  let reads = 0
  const released = []
  const registry = createMediaRegistry({ load: () => { reads += 1; return new Promise((resolve) => { finish = resolve }) }, release: (uri) => released.push(uri) })
  const first = registry.ensure('one')
  assert.equal(registry.ensure('one'), first)
  await Promise.resolve()
  registry.seed('one', { uri: 'blob:imported' })
  finish({ uri: 'blob:late-read' })
  assert.equal((await first).uri, 'blob:imported')
  assert.equal(reads, 1)
  assert.deepEqual(released, ['blob:late-read'])
})

test('누락된 원본과 다른 사진을 독립 복원하고 재시도 성공을 구독자에게 전달한다', async () => {
  let missing = true
  let notified = 0
  const registry = createMediaRegistry({ load: async (id) => {
    if (id === 'missing' && missing) throw new Error('not found')
    return { uri: `file:${id}` }
  } })
  const unsubscribe = registry.subscribe(() => { notified += 1 })
  const results = await Promise.allSettled(['missing', 'good'].map((id) => registry.ensure(id)))
  assert.deepEqual(results.map((result) => result.status), ['rejected', 'fulfilled'])
  assert.equal(registry.get('good').uri, 'file:good')
  const before = registry.getRevision()
  missing = false
  assert.equal((await registry.ensure('missing')).uri, 'file:missing')
  assert.ok(registry.getRevision() > before && notified > 0)
  unsubscribe()
})

test('실제 IndexedDB에서 ID만 있는 사진·GIF와 표시본을 새 세션 캐시로 복원한다', async (t) => {
  globalThis.indexedDB = indexedDB
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'react-native') return { url: 'binding-test:platform', shortCircuit: true }
      if (specifier === 'expo-crypto') return { url: 'binding-test:crypto', shortCircuit: true }
      if (specifier === './mediaRepository') return next('./mediaRepository.web.js', context)
      return next(specifier, context)
    },
    load(url, context, next) {
      if (url === 'binding-test:platform') return { format: 'module', source: "export const Platform = { OS: 'web' }", shortCircuit: true }
      if (url === 'binding-test:crypto') return { format: 'module', source: "export { randomUUID } from 'node:crypto'", shortCircuit: true }
      return next(url, context)
    },
  })
  t.after(() => hooks.deregister())
  const repository = await import('../src/editor/utils/mediaRepository.web.js')
  const records = [
    { id: 'photo', bytes: 'original-heic', type: 'image/heic', display: new Blob(['display-jpeg'], { type: 'image/jpeg' }) },
    { id: 'gif', bytes: 'GIF89a-original-frames', type: 'image/gif' },
    { id: 'legacy', bytes: 'GIF89a-legacy', type: 'image/gif' },
  ]
  for (const item of records) {
    const uri = await repository.save(new Blob([item.bytes], { type: item.type }), { mediaFileId: item.id, mimeType: item.type }, item.display ? { source: item.display } : null)
    URL.revokeObjectURL(uri)
  }
  const page = { objects: [
    { mediaFileId: 'photo', x: 100, y: 200, w: 300, h: 150, rotation: 25, crop: { fx: 0.2, fy: 0.7, zoom: 2 } },
    { mediaFileId: 'gif' }, { src: 'media:legacy' }, { mediaFileId: 'missing' },
  ] }
  const geometry = JSON.stringify(page)
  const store = await import('../src/editor/utils/mediaStore.js')
  assert.deepEqual(await store.hydrateMedia(), { loaded: [], failures: [] })
  const hydrated = await store.hydrateMedia({ pages: [page] })
  assert.deepEqual(hydrated.loaded, ['photo', 'gif', 'legacy'])
  assert.equal(hydrated.failures[0].mediaFileId, 'missing')
  const uri = store.mediaUri({ mediaFileId: 'photo', src: 'media:wrong' })
  assert.equal(await (await fetch(uri)).text(), 'display-jpeg')
  assert.equal(await (await store.mediaService.get('photo')).blob.text(), 'original-heic')
  assert.equal(await (await fetch(store.mediaUri({ mediaFileId: 'gif' }))).text(), 'GIF89a-original-frames')
  assert.equal(store.mediaUri('data:image/png;base64,AA=='), 'data:image/png;base64,AA==')
  assert.equal(store.mediaUri({ mediaFileId: 'photo', poster: 'data:poster' }, { still: true }), 'data:poster')
  assert.equal(JSON.stringify(page), geometry)

  // 앱 재시작에 해당하도록 세션 캐시를 새로 만들고 저장된 원본을 다시 조회한다.
  const restarted = await import('../src/editor/utils/mediaStore.js?new-session')
  assert.equal(restarted.mediaUri({ mediaFileId: 'photo' }), null)
  await restarted.hydrateMedia({ pages: [page] })
  assert.equal(await (await fetch(restarted.mediaUri({ mediaFileId: 'photo' }))).text(), 'display-jpeg')
  assert.equal(JSON.stringify(page), geometry)
  for (const item of records) {
    URL.revokeObjectURL(store.mediaUri({ mediaFileId: item.id }))
    URL.revokeObjectURL(restarted.mediaUri({ mediaFileId: item.id }))
  }
})

