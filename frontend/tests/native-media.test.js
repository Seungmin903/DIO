import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

test('네이티브 파일 복사 완료·메타데이터 저장을 기다리고 실패 시 파일을 정리한다', async (t) => {
  const files = new Map([['file:///picker/motion.gif', new TextEncoder().encode('GIF89a-original-bytes')]])
  const records = new Map()
  let failMetadata = false
  let outputCount = 0
  let released = 0
  let failRead = false
  let closedHandles = 0
  class Directory {
    constructor(...paths) { this.uri = paths.map((p) => p.uri ?? p).join('/') }
    create() {}
  }
  class File extends Directory {
    get exists() { return files.has(this.uri) }
    get size() { return files.get(this.uri)?.length ?? 0 }
    async copy(target) {
      // SDK 57 copy()는 비동기다. 호출자가 await하지 않으면 exists 검사에서 실패한다.
      await new Promise((resolve) => setImmediate(resolve))
      files.set(target.uri, files.get(this.uri).slice())
    }
    delete() { files.delete(this.uri) }
    open() {
      let closed = false
      return {
        readBytes: async (n) => {
          // SDK 58: a close before the asynchronous read finishes must fail.
          await new Promise(resolve => setImmediate(resolve))
          if (closed) throw new Error('file handle is closed')
          if (failRead) throw new Error('read failed')
          return files.get(this.uri).slice(0, n)
        },
        close() { closed = true; closedHandles += 1 },
      }
    }
  }
  globalThis.__mediaNativeTest = {
    fs: { Directory, File, FileMode: { ReadOnly: 'r' }, Paths: { document: 'file:///documents' } },
    Image: { getSize: (_, ok) => ok(128, 128) },
    manipulator: {
      SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
      ImageManipulator: { manipulate: () => {
        let size = { width: 8064, height: 6048 }
        return {
          resize: (next) => { size = next }, release: () => { released += 1 },
          renderAsync: async () => ({
            release: () => { released += 1 },
            saveAsync: async ({ format }) => {
              const uri = `file:///cache/converted-${++outputCount}.${format}`
              files.set(uri, new TextEncoder().encode('converted-image'))
              return { uri, ...size }
            },
          }),
        }
      } },
    },
    storage: {
    setItem: async (key, value) => { if (failMetadata) throw new Error('ENOSPC'); records.set(key, value) },
    getItem: async (key) => records.get(key) ?? null,
    removeItem: async (key) => records.delete(key),
    getAllKeys: async () => [...records.keys()],
    multiGet: async (keys) => keys.map((key) => [key, records.get(key)]),
    },
  }
  const sources = {
    'expo-file-system': 'export const { Directory, File, FileMode, Paths } = globalThis.__mediaNativeTest.fs',
    'react-native': 'export const { Image } = globalThis.__mediaNativeTest',
    'expo-image-manipulator': 'export const { ImageManipulator, SaveFormat } = globalThis.__mediaNativeTest.manipulator',
    '@react-native-async-storage/async-storage': 'export default globalThis.__mediaNativeTest.storage',
  }
  // 실제 Expo 네이티브 모듈은 Node에서 실행할 수 없어 IO 경계만 교체한다.
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      return sources[specifier] ? { url: 'media-test:' + specifier, shortCircuit: true } : next(specifier, context)
    },
    load(url, context, next) {
      return url.startsWith('media-test:') ? { format: 'module', source: sources[url.slice(11)], shortCircuit: true } : next(url, context)
    },
  })
  t.after(() => { hooks.deregister(); delete globalThis.__mediaNativeTest })
  const repository = await import('../src/editor/utils/mediaRepository.native.js')
  const source = await repository.readAsset({ uri: 'file:///picker/motion.gif' })
  assert.ok(source.header instanceof Uint8Array)
  assert.equal(closedHandles, 1)
  const media = { mediaFileId: 'local-1', extension: 'gif', fileSize: source.size, width: 128, height: 128 }
  const uri = await repository.save(source.source, media)
  assert.deepEqual(files.get(uri), files.get('file:///picker/motion.gif'))
  assert.deepEqual((await repository.get('local-1')).media, media)
  assert.deepEqual(await repository.entries(), [{ id: 'local-1', uri }])
  const multiGet = globalThis.__mediaNativeTest.storage.multiGet
  globalThis.__mediaNativeTest.storage.multiGet = () => { throw Error('ID 집계에서는 메타데이터를 읽지 않는다') }
  try { assert.deepEqual(await repository.entries({ idsOnly: true }), [{ id: 'local-1' }]) }
  finally { globalThis.__mediaNativeTest.storage.multiGet = multiGet }

  const input = await repository.readAsset({ uri: 'file:///picker/motion.gif' })
  const dimensions = await repository.decode(input, { extension: 'heic' })
  const display = await repository.createDisplay(input, { extension: 'heic' }, dimensions, 'photo')
  assert.deepEqual({ width: display.metadata.width, height: display.metadata.height }, { width: 3072, height: 2304 })
  const convertedMedia = { ...media, mediaFileId: 'with-display', display: display.metadata }
  const displayUri = await repository.save(input.source, convertedMedia, display)
  assert.equal(displayUri, 'file:///documents/dio-media/with-display.display.jpg')
  assert.deepEqual(files.get('file:///documents/dio-media/with-display.gif'), files.get('file:///picker/motion.gif'))
  repository.dispose(input)
  assert.equal(files.has(input.decodedSource.uri), false)
  assert.equal(files.has(input.displaySource.uri), false)
  assert.equal(released, 4)
  const restored = await repository.entries()
  assert.equal(restored.find(({ id }) => id === 'with-display').uri, displayUri)
  assert.ok((await repository.get('with-display')).displayBlob)

  failMetadata = true
  await assert.rejects(repository.save(source.source, { ...media, mediaFileId: 'failed' }), (e) => e.code === 'STORAGE_FULL')
  assert.equal(files.has('file:///documents/dio-media/failed.gif'), false)
  assert.equal(records.has('dio:media:v1:failed'), false)
  assert.equal(files.has(uri), true)
  const failedDisplayMedia = { ...convertedMedia, mediaFileId: 'failed-display' }
  const displaySource = new File(displayUri)
  await assert.rejects(repository.save(source.source, failedDisplayMedia, { source: displaySource }), (e) => e.code === 'STORAGE_FULL')
  assert.equal(files.has('file:///documents/dio-media/failed-display.gif'), false)
  assert.equal(files.has('file:///documents/dio-media/failed-display.display.jpg'), false)

  // Both import and restore must await rejection and still close the handle.
  const beforeFailures = closedHandles
  failRead = true
  await assert.rejects(repository.readAsset({ uri: 'file:///picker/motion.gif' }), e => e.code === 'MEDIA_READ_FAILED')
  await assert.rejects(repository.get('local-1'), e => e.code === 'STORAGE_READ_FAILED')
  assert.equal(closedHandles, beforeFailures + 2)
})
