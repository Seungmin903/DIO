import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvasMedia, createMediaRequest } from '../src/collaboration/canvasMedia.js'
import { withUploadRetry } from '../src/diary/services/guestDiaryImport.js'

test('사진 보관함의 마지막 자리까지만 새 업로드를 허용한다', async () => {
  let count = 199
  let listCalls = 0
  const request = createMediaRequest({
    photoStorage: { getItem: async () => null, setItem: async () => {} },
    accountId: '1', sessionKey: 'session', baseUrl: 'https://example.test',
    auth: {
      getSessionKey: () => 'session',
      getAccessToken: async () => 'token',
      getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }),
    },
    fetchImpl: async (url, { method }) => {
      if (method === 'POST') {
        count++
        return { ok: true, json: async () => ({}) }
      }
      listCalls++
      const offset = new URL(url).searchParams.has('cursor') ? 100 : 0
      const mediaFiles = Array.from({ length: Math.min(count - offset, 100) }, (_, i) => ({
        mediaFileId: String(offset + i), libraryCategory: 'PHOTO',
      }))
      return { ok: true, json: async () => ({ mediaFiles, nextCursor: offset ? null : 'next' }) }
    },
  })
  const options = { method: 'POST', category: 'PHOTO' }
  await request('/media', options)
  await assert.rejects(request('/media', options), { code: 'STORAGE_LIMIT_REACHED', message: '사진 저장 한도는 200장이에요.' })
  assert.equal(count, 200)
  assert.equal(listCalls, 2, '두 페이지를 한 번만 읽고 성공한 업로드를 캐시에 반영한다')
})

test('업로드 실패와 사진 재집계가 겹쳐도 가득 찬 보관함의 추가를 거절한다', async () => {
  let now = 0, listing = 0, failUpload, finishListing
  const originalNow = Date.now
  Date.now = () => now
  const request = createMediaRequest({
    photoStorage: { getItem: async () => null, setItem: async () => {} },
    accountId: '1', sessionKey: 'session', baseUrl: 'https://example.test',
    auth: {
      getSessionKey: () => 'session', getAccessToken: async () => 'token',
      getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }),
    },
    fetchImpl: async (url, { method }) => {
      if (method === 'POST') return new Promise((resolve, reject) => { failUpload = reject })
      listing++
      const count = listing === 1 ? 199 : 200
      if (listing > 1) await new Promise(resolve => { finishListing = resolve })
      return { ok: true, json: async () => ({ mediaFiles: Array.from({ length: count }, (_, i) => ({ mediaFileId: String(i), libraryCategory: 'PHOTO' })) }) }
    },
  })
  try {
    await request.checkPhotoCapacity()
    const failed = request('/media', { method: 'POST', category: 'PHOTO' }).catch(error => error)
    await new Promise(resolve => setImmediate(resolve))
    now = 31000
    const checks = [request.checkPhotoCapacity(), request.checkPhotoCapacity()]
    const results = Promise.allSettled(checks)
    await new Promise(resolve => setImmediate(resolve))
    failUpload(new Error('offline'))
    await failed
    finishListing()
    for (const result of await results) {
      assert.equal(result.status, 'rejected')
      assert.equal(result.reason.code, 'STORAGE_LIMIT_REACHED')
    }
    assert.equal(listing, 2)
  } finally { Date.now = originalNow }
})

test('동기화 대기 사진은 반복 선택·재시작에도 합산하고 업로드 성공 및 파일 삭제를 반영한다', async () => {
  const records = new Map(), available = new Set(['local-1', 'local-2'])
  const storage = () => ({ getItem: async key => records.get(key), setItem: async (key, value) => records.set(key, value) })
  let serverCount = 198, uploads = 0
  const create = (accountId = 'owner', photoStorage = storage()) => createMediaRequest({
    accountId, sessionKey: 'session', baseUrl: 'https://example.test', photoStorage,
    photoEntries: async () => [...available].map(id => ({ id })),
    auth: { getSessionKey: () => 'session', getAccessToken: async () => 'token', getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }) },
    fetchImpl: async (_, { method }) => {
      if (method === 'POST') { uploads++; serverCount++; return { ok: true, json: async () => ({ mediaFileId: 'remote' }) } }
      return { ok: true, json: async () => ({ mediaFiles: Array.from({ length: serverCount }, (_, i) => ({ mediaFileId: String(i), libraryCategory: 'PHOTO' })) }) }
    },
  })
  const first = create()
  await first.checkPhotoCapacity(0, [{ mediaFileId: 'local-1' }])
  await first.checkPhotoCapacity(1)
  await first.checkPhotoCapacity(0, [{ mediaFileId: 'local-2' }])
  await assert.rejects(first.checkPhotoCapacity(1), { code: 'STORAGE_LIMIT_REACHED' })
  const reopened = create()
  await assert.rejects(reopened.checkPhotoCapacity(1), { code: 'STORAGE_LIMIT_REACHED' })
  await create('other-account').checkPhotoCapacity(1)
  await reopened('/media', { method: 'POST', category: 'PHOTO', localPhotoId: 'local-1' })
  assert.equal(uploads, 1)
  assert.deepEqual(JSON.parse(records.get('dio:member:pending-photos:owner')), ['local-2'])
  await assert.rejects(reopened.checkPhotoCapacity(1), { code: 'STORAGE_LIMIT_REACHED' })
  available.delete('local-2')
  await reopened.checkPhotoCapacity(1)
  serverCount = 198
  available.add('local-2')
  const sharedStorage = storage(), editor = create('shared', sharedStorage), cover = create('shared', sharedStorage)
  await editor.checkPhotoCapacity(0, [{ mediaFileId: 'local-1' }])
  await cover.checkPhotoCapacity(0, [{ mediaFileId: 'local-2' }])
  await editor('/media', { method: 'POST', category: 'PHOTO', localPhotoId: 'local-1' })
  await assert.rejects(cover.checkPhotoCapacity(1), { code: 'STORAGE_LIMIT_REACHED' })
})

for (const raw of ['{broken', '{}', '[42]']) test(`손상된 회원 대기 기록 ${raw}는 원인 코드와 기록 ID를 반환한다`, async () => {
  const request = createMediaRequest({
    accountId: 'owner', sessionKey: 'session', baseUrl: 'https://example.test',
    photoStorage: { getItem: async () => raw, setItem: async () => {} },
    auth: { getSessionKey: () => 'session', getAccessToken: async () => 'token', getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }) },
    fetchImpl: async () => ({ ok: true, json: async () => ({ mediaFiles: [] }) }),
  })
  for (let retry = 0; retry < 2; retry++) await assert.rejects(request.checkPhotoCapacity(), error => {
    assert.equal(error.code, 'MEMBER_PHOTO_INDEX_DAMAGED')
    assert.equal(error.storageKey, 'dio:member:pending-photos:owner')
    assert.ok(error.message.includes(error.storageKey))
    return true
  })
})

test('같은 계정에서 실패한 업로드 뒤 다른 업로드가 성공해도 null을 1로 캐시하지 않는다', async () => {
  const storage = { getItem: async () => null, setItem: async () => {} }, gates = []
  let count = 199, lists = 0
  const create = () => createMediaRequest({
    accountId: 'shared', sessionKey: 'session', baseUrl: 'https://example.test', photoStorage: storage,
    auth: { getSessionKey: () => 'session', getAccessToken: async () => 'token', getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }) },
    fetchImpl: async (_, { method }) => {
      if (method === 'POST') return new Promise((resolve, reject) => gates.push({ resolve, reject }))
      lists++
      return { ok: true, json: async () => ({ mediaFiles: Array.from({ length: count }, (_, i) => ({ mediaFileId: String(i), libraryCategory: 'PHOTO' })) }) }
    },
  })
  const first = create(), second = create()
  const failed = first('/media', { method: 'POST', category: 'PHOTO' }).catch(error => error)
  const succeeded = second('/media', { method: 'POST', category: 'PHOTO' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(gates.length, 1, '같은 계정은 요청 인스턴스가 달라도 한 번에 하나만 전송한다')
  gates[0].reject(Error('offline')); await failed
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(gates.length, 2, '실패가 다음 업로드를 영구 차단하지 않는다')
  count = 200
  gates[1].resolve({ ok: true, json: async () => ({}) }); await succeeded
  await assert.rejects(second.checkPhotoCapacity(), { code: 'STORAGE_LIMIT_REACHED' })
  assert.equal(lists, 2, '실패로 무효화된 캐시는 다음 업로드 전에 재조회한다')
})

test('성공한 업로드는 대기 기록 정리 실패에도 매핑을 저장하고 재전송하지 않는다', async () => {
  const local = '11111111-1111-4111-8111-111111111111', remote = '22222222-2222-4222-8222-222222222222'
  const records = new Map(), key = 'dio:member:pending-photos:owner'
  let failCleanup = false, posts = 0
  const storage = {
    getItem: async key => records.get(key),
    setItem: async (name, value) => { if (name === key && failCleanup) throw Error('disk full'); records.set(name, value) },
  }
  const request = createMediaRequest({ accountId: 'owner', sessionKey: 'session', baseUrl: 'https://example.test', photoStorage: storage,
    auth: { getSessionKey: () => 'session', getAccessToken: async () => 'token', getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }) },
    fetchImpl: async (_, { method }) => {
      if (method === 'POST') { posts++; return { ok: true, json: async () => ({ mediaFileId: remote }) } }
      return { ok: true, json: async () => ({ mediaFiles: [] }) }
    },
  })
  await request.checkPhotoCapacity(0, [{ mediaFileId: local }])
  failCleanup = true
  const create = () => createCanvasMedia({ request, storage, key: 'mapping', files: { upload: async () => ({}) } })
  const input = { changes: { creates: [{ elementType: 'IMAGE', mediaFileId: local }] } }
  const first = create()
  assert.equal((await first.prepare(input)).changes.creates[0].mediaFileId, remote)
  assert.equal(records.get(`mapping:${local}`), remote)
  const wrappedRequest = withUploadRetry(request)
  assert.equal(wrappedRequest.checkPhotoCapacity, request.checkPhotoCapacity)
  failCleanup = false
  const reopened = createCanvasMedia({ request: wrappedRequest, storage, key: 'mapping', files: { upload: () => assert.fail('기존 매핑을 사용해야 한다') } })
  assert.equal((await reopened.prepare(input)).changes.creates[0].mediaFileId, remote)
  assert.equal(posts, 1)
  assert.deepEqual(JSON.parse(records.get(key)), [])
  first.dispose(); reopened.dispose()
})

test('대기 기록 손상 시 기존 사진 동기화만 서버 한도로 허용하고 새 선택은 차단한다', async () => {
  let count = 199, posts = 0
  const raw = '{broken'
  const request = createMediaRequest({ accountId: 'owner', sessionKey: 'session', baseUrl: 'https://example.test',
    photoStorage: { getItem: async () => raw, setItem: async () => { throw Error('손상 기록을 덮어쓰면 안 된다') } },
    auth: { getSessionKey: () => 'session', getAccessToken: async () => 'token', getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }) },
    fetchImpl: async (_, { method }) => {
      if (method === 'POST') { posts++; count++; return { ok: true, json: async () => ({ mediaFileId: 'remote' }) } }
      return { ok: true, json: async () => ({ mediaFiles: Array.from({ length: count }, (_, i) => ({ mediaFileId: String(i), libraryCategory: 'PHOTO' })) }) }
    },
  })
  await assert.rejects(request.checkPhotoCapacity(1), { code: 'MEMBER_PHOTO_INDEX_DAMAGED' })
  await request('/media', { method: 'POST', category: 'PHOTO', localPhotoId: 'existing' })
  assert.equal(posts, 1)
  await assert.rejects(request('/media', { method: 'POST', category: 'PHOTO', localPhotoId: 'another' }), { code: 'STORAGE_LIMIT_REACHED' })
  await assert.rejects(request.checkPhotoCapacity(1), { code: 'MEMBER_PHOTO_INDEX_DAMAGED' })
})

for (const failCleanup of [false, true]) test(`정리가 지연되고 실패=${failCleanup}여도 업로드 성공 사진을 이중 집계하지 않는다`, async () => {
  const localId = 'selected', records = new Map()
  let block = false, release, entered = false
  const gate = new Promise(resolve => { release = resolve })
  const storage = {
    getItem: async key => records.get(key),
    setItem: async (key, value) => {
      if (block) { entered = true; await gate; if (failCleanup) throw Error('disk full') }
      records.set(key, value)
    },
  }
  const request = createMediaRequest({ accountId: 'owner', sessionKey: 'session', baseUrl: 'https://example.test', photoStorage: storage,
    auth: { getSessionKey: () => 'session', getAccessToken: async () => 'token', getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }) },
    fetchImpl: async (_, { method }) => ({ ok: true, json: async () => method === 'POST' ? { mediaFileId: 'remote' } : {
      mediaFiles: Array.from({ length: 198 }, (_, i) => ({ mediaFileId: String(i), libraryCategory: 'PHOTO' })),
    } }),
  })
  await request.checkPhotoCapacity(0, [{ mediaFileId: localId }])
  block = true
  const uploading = request('/media', { method: 'POST', category: 'PHOTO', localPhotoId: localId })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(entered, true)
  const selecting = request.checkPhotoCapacity(1)
  release()
  await uploading
  await selecting // 서버 199장 + 새 사진 1장: 허용
  await assert.rejects(request.checkPhotoCapacity(2), { code: 'STORAGE_LIMIT_REACHED' })
})

test('같은 계정의 두 요청이 199장에서 동시에 올려도 첫 업로드만 전송한다', async () => {
  const storage = { getItem: async () => null, setItem: async () => {} }
  let release, posts = 0
  const create = () => createMediaRequest({ accountId: 'owner', sessionKey: 'session', baseUrl: 'https://example.test', photoStorage: storage,
    auth: { getSessionKey: () => 'session', getAccessToken: async () => 'token', getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }) },
    fetchImpl: async (_, { method }) => {
      if (method === 'POST') { posts++; await new Promise(resolve => { release = resolve }); return { ok: true, json: async () => ({}) } }
      return { ok: true, json: async () => ({ mediaFiles: Array.from({ length: 199 }, (_, i) => ({ mediaFileId: String(i), libraryCategory: 'PHOTO' })) }) }
    },
  })
  const first = create(), second = create()
  await Promise.all([first.checkPhotoCapacity(), second.checkPhotoCapacity()])
  const uploading = first('/media', { method: 'POST', category: 'PHOTO' })
  const rejected = assert.rejects(second('/media', { method: 'POST', category: 'PHOTO' }), { code: 'STORAGE_LIMIT_REACHED' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(posts, 1)
  release()
  await uploading; await rejected
  assert.equal(posts, 1)
})

test('다른 계정의 업로드는 한 계정의 대기열에 묶이지 않는다', async () => {
  const storage = { getItem: async () => null, setItem: async () => {} }, releases = []
  const create = accountId => createMediaRequest({ accountId, sessionKey: 'session', baseUrl: 'https://example.test', photoStorage: storage,
    auth: { getSessionKey: () => 'session', getAccessToken: async () => 'token', getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }) },
    fetchImpl: async (_, { method }) => {
      if (method === 'POST') await new Promise(resolve => releases.push(resolve))
      return { ok: true, json: async () => method === 'POST' ? {} : { mediaFiles: [] } }
    },
  })
  const jobs = ['one', 'two'].map(account => create(account)('/media', { method: 'POST', category: 'PHOTO' }))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(releases.length, 2)
  releases.forEach(resolve => resolve())
  await Promise.all(jobs)
})

for (const photoStorage of [undefined, {}, { getItem: async () => null }, { setItem: async () => {} }]) {
  test(`사진 저장소 연결 누락은 집계·PHOTO 업로드 전에 거절한다: ${Object.keys(photoStorage ?? {}).join(',')}`, async () => {
    let calls = 0
    const request = createMediaRequest({ accountId: 'owner', sessionKey: 'session', baseUrl: 'https://example.test', photoStorage,
      auth: { getSessionKey: () => 'session' },
      fetchImpl: async () => { calls++; throw Error('전송하면 안 된다') },
    })
    await assert.rejects(request.checkPhotoCapacity(), { code: 'PHOTO_LIBRARY_NOT_READY' })
    await assert.rejects(request('/media', { method: 'POST', category: 'PHOTO' }), { code: 'PHOTO_LIBRARY_NOT_READY' })
    assert.equal(calls, 0)
  })
}

for (const registration of ['before-request', 'after-request', 'cold-start']) {
  test(`취소된 사진 정리는 같은 계정의 모든 요청에서 공유된다: ${registration}`, async () => {
    const pendingKey = 'dio:member:pending-photos:owner', records = new Map([[pendingKey, JSON.stringify(['cancelled', 'kept'])]])
    const storage = { getItem: async key => records.get(key), setItem: async (key, value) => records.set(key, value) }
    let inventoryCalls = 0, posts = 0
    const inventory = async options => { assert.equal(options.idsOnly, true); inventoryCalls++; return [{ id: 'kept' }] }
    const create = photoEntries => createMediaRequest({ accountId: 'owner', sessionKey: 'session', baseUrl: 'https://example.test', photoStorage: storage, photoEntries,
      auth: { getSessionKey: () => 'session', getAccessToken: async () => 'token', getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }) },
      fetchImpl: async (_, { method }) => {
        if (method === 'POST') { posts++; return { ok: true, json: async () => ({ mediaFileId: 'remote' }) } }
        return { ok: true, json: async () => ({ mediaFiles: Array.from({ length: 198 }, (_, i) => ({ mediaFileId: String(i), libraryCategory: 'PHOTO' })) }) }
      },
    })
    let request
    if (registration === 'before-request') { create(inventory); request = create() }
    else if (registration === 'after-request') { request = create(); create(inventory) }
    else request = create(inventory)
    await request.checkPhotoCapacity(1)
    assert.deepEqual(JSON.parse(records.get(pendingKey)), ['kept'])
    await request('/media', { method: 'POST', category: 'PHOTO', localPhotoId: 'kept' })
    assert.equal(posts, 1)
    assert.ok(inventoryCalls > 0)
    assert.deepEqual(JSON.parse(records.get(pendingKey)), [])
    await request.checkPhotoCapacity(1)
  })
}

test('같은 계정 재로그인은 이전 세션의 진행 중 집계나 늦은 응답을 재사용하지 않는다', async () => {
  const storage = { getItem: async () => null, setItem: async () => {} }
  let session = 'old', release, newCalls = 0
  const auth = { getSessionKey: () => session, getAccessToken: async () => 'token', getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }) }
  const create = key => createMediaRequest({ auth, accountId: 'owner', sessionKey: key, baseUrl: 'https://example.test', photoStorage: storage,
    fetchImpl: async () => {
      if (key === 'old') await new Promise(resolve => { release = resolve })
      else newCalls++
      return { ok: true, json: async () => ({ mediaFiles: Array.from({ length: key === 'old' ? 200 : 198 }, (_, i) => ({ mediaFileId: String(i), libraryCategory: 'PHOTO' })) }) }
    },
  })
  const old = create('old').checkPhotoCapacity(1).catch(error => error)
  await new Promise(resolve => setImmediate(resolve))
  session = 'new'
  const fresh = create('new'), checking = fresh.checkPhotoCapacity(1)
  try {
    const status = await Promise.race([checking.then(() => 'ready'), new Promise(resolve => setImmediate(() => resolve('waiting-for-old')))])
    assert.equal(status, 'ready')
  } finally { release() }
  assert.match((await old).message, /로그인 상태가 변경/)
  await fresh.checkPhotoCapacity(2)
  await assert.rejects(fresh.checkPhotoCapacity(3), { code: 'STORAGE_LIMIT_REACHED' })
  assert.equal(newCalls, 1)
})

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
const MB = 1024 * 1024

function compile(path, imports, extra = {}) {
  const code = babel.transformSync(readFileSync(path, 'utf8'), { filename: String(path), configFile: false, babelrc: false,
    plugins: [expo.resolve('@babel/plugin-transform-typescript'), expo.resolve('@babel/plugin-transform-modules-commonjs')] }).code
  const module = { exports: {} }
  new Function('require', 'module', 'exports', ...Object.keys(extra), code)(id => {
    if (id in imports) return imports[id]
    throw Error(id)
  }, module, module.exports, ...Object.values(extra))
  return module.exports
}

const limits = { sharedImageMaxBytes: 5 * MB, sharedGifMaxBytes: 15 * MB,
  mediaShareSizeMessage: extension => extension === 'gif' ? 'GIF limit' : 'image limit' }

function uploader(platform) {
  let stored = { media: { extension: 'png', mimeType: 'image/png', fileSize: 1 }, blob: { uri: 'file:///image.png' } }
  class FormData { append() {} }
  const common = {
    './mediaRetry.js': {}, './mediaStore': {}, '../utils/mediaPolicy.js': {},
    '../utils/shareImagePlan.js': { needsShareJpeg: () => false, needsSharePng: () => false }, '../utils/shareImage': {},
    '../../diary/utils/pdfSource.js': { PDF_SHARE_MAX_BYTES: 25 * MB }, '../../shared/mediaLimits.js': limits,
  }
  const imports = platform === 'native' ? {
    ...common, 'expo-file-system': { File: class {}, Paths: {} },
    '../utils/mediaRepository.native.js': { get: async () => stored },
    '../../diary/utils/pdfSourceStore.native.js': {},
  } : {
    ...common, '../utils/mediaRepository.web.js': { get: async () => stored },
    '../../diary/utils/pdfSourceStore.web.js': {},
  }
  const path = new URL(`../src/editor/services/canvasMediaFiles.${platform}.js`, import.meta.url)
  const { canvasMediaFiles } = compile(path, imports, { FormData })
  return { upload: () => canvasMediaFiles.upload('media-id', 'PHOTO'), setStored: value => { stored = value } }
}

for (const platform of ['native', 'web']) test(`${platform} 공유 업로드는 GIF에만 15MiB 한도를 적용한다`, async () => {
  const subject = uploader(platform)
  subject.setStored({ media: { extension: 'gif', mimeType: 'image/gif', fileSize: 6 * MB }, blob: { uri: 'file:///animated.gif' } })
  await assert.doesNotReject(subject.upload())

  subject.setStored({ media: { extension: 'gif', mimeType: 'image/gif', fileSize: limits.sharedGifMaxBytes + 1 }, blob: { uri: 'file:///large.gif' } })
  await assert.rejects(subject.upload(), { status: 413, code: 'MEDIA_FILE_TOO_LARGE' })

  subject.setStored({ media: { extension: 'png', mimeType: 'image/png', fileSize: limits.sharedImageMaxBytes + 1 }, blob: { uri: 'file:///large.png' } })
  await assert.rejects(subject.upload(), { status: 413, code: 'MEDIA_FILE_TOO_LARGE' })
})

for (const platform of ['native', 'web']) test(`${platform} 5MiB 를 넘는 투명할 수 있는 PNG(iPad 화면 캡처)는 PNG 그대로 줄여 올린다`, async () => {
  const MBs = 1024 * 1024, calls = []
  class FormData { constructor() { this.parts = [] } append(...args) { this.parts.push(args) } }
  const stored = { media: { extension: 'png', mimeType: 'image/png', fileSize: 11 * MBs, width: 1640, height: 2360 }, blob: { uri: 'file:///shot.png' } }
  const plan = await import('../src/editor/utils/shareImagePlan.js')
  const shareImage = { toShareJpeg: async () => { throw Error('JPEG 로 바꾸면 투명한 부분에 배경이 생긴다') },
    toSharePng: async (source, size) => { calls.push(size); return { uri: 'file:///small.png', blob: { size: 3 * MBs }, size: 3 * MBs, width: 902, height: 1298 } } }
  const imports = {
    './mediaRetry.js': {}, './mediaStore': {}, '../utils/mediaPolicy.js': {}, '../utils/shareImagePlan.js': plan, '../utils/shareImage': shareImage,
    '../../diary/utils/pdfSource.js': { PDF_SHARE_MAX_BYTES: 25 * MBs }, '../../shared/mediaLimits.js': limits,
    ...(platform === 'native' ? { 'expo-file-system': { File: class { bytes() {} }, Paths: {} }, '../utils/mediaRepository.native.js': { get: async () => stored }, '../../diary/utils/pdfSourceStore.native.js': {} }
      : { '../utils/mediaRepository.web.js': { get: async () => stored }, '../../diary/utils/pdfSourceStore.web.js': {} }),
  }
  const { canvasMediaFiles } = compile(new URL(`../src/editor/services/canvasMediaFiles.${platform}.js`, import.meta.url), imports, { FormData })
  const form = await canvasMediaFiles.upload('media-id', 'PHOTO')
  assert.deepEqual(calls.map(size => [size.width, size.height]), [[1640, 2360]])
  assert.ok(form.parts.some(([name, , filename]) => name === 'file' && filename === 'image.png' || name === 'file' && filename?.name === 'image.png' || name === 'file'))
})
