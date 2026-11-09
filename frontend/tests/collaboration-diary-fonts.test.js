import test from 'node:test'
import assert from 'node:assert/strict'
import { createDiaryFonts, fileIdFromSharedName, personalFontIds, sharedFontFileName, withDiaryFonts } from '../src/collaboration/diaryFonts.js'
import { createMediaRequest } from '../src/collaboration/canvasMedia.js'

const diaryId = '10000000-0000-4000-8000-000000000001'
const fileId = '20000000-0000-4000-8000-000000000001', otherId = '20000000-0000-4000-8000-000000000002'
const mediaFileId = '30000000-0000-4000-8000-000000000001', otherMediaId = '30000000-0000-4000-8000-000000000002'
const textRow = (font, elementType = 'TEXT') => ({ elementType, propertiesJson: { text: '안녕', font } })
const body = rows => ({ clientOperationId: 'op', changes: { creates: rows }, expectedVersions: {} })

function fixture({ mine = [{ id: `personal-${fileId}`, fileId, uri: 'file://font.ttf' }], has = () => false, serverFonts = [], shareFailure = null } = {}) {
  const disk = new Map(), calls = [], registered = [], saved = new Map()
  let now = 0
  const transport = async request => {
    calls.push({ ...request })
    if (request.method === 'POST' && request.path === `/diaries/${diaryId}/fonts`) {
      if (shareFailure) { const failure = shareFailure; shareFailure = null; throw failure }
      return null
    }
    if (!request.method && request.path === `/diaries/${diaryId}/fonts`) return serverFonts
    throw Error(`예상하지 않은 요청 ${request.method} ${request.path}`)
  }
  let uploads = 0
  const request = async (path, options) => {
    calls.push({ path, method: options?.method ?? 'GET' })
    if (path === '/media') { uploads++; assert.equal(options.body.font.fileId, fileId); return { mediaFileId: uploads === 1 ? mediaFileId : otherMediaId } }
    if (/\/fonts\/[0-9a-f-]+\/file$/.test(path)) { assert.equal(options.binary, true); return new Uint8Array([0, 1, 0, 0]) }
    throw Error(`예상하지 않은 파일 요청 ${path}`)
  }
  const fonts = createDiaryFonts({
    diaryId, transport, request, storage: { getItem: async k => disk.get(k) ?? null, setItem: async (k, v) => disk.set(k, v), removeItem: async k => disk.delete(k) }, key: 'uploads',
    files: { upload: async font => ({ font }), cachedUri: async id => saved.get(id) ?? null, save: async (id, bytes) => { saved.set(id, `file://shared/${id}.ttf`); return saved.get(id) } },
    library: { mine: async () => mine, has, register: list => registered.push(...list) },
    now: () => now,
  })
  return { fonts, calls, registered, disk, uploads: () => uploads, tick: ms => { now += ms } }
}

test('폰트 이름에 기기 폰트 id 를 담고 글자 · 도형 요소에서 내 폰트만 모은다', () => {
  assert.equal(fileIdFromSharedName(sharedFontFileName(fileId)), fileId)
  assert.equal(fileIdFromSharedName('손글씨.ttf'), null)
  assert.deepEqual(personalFontIds([textRow(`personal-${fileId}`), textRow(`personal-${fileId}`, 'SHAPE'), textRow('nanum-gothic'), { elementType: 'STICKER', propertiesJson: { font: `personal-${otherId}` } }]), [fileId])
})

test('내 폰트로 쓴 글자를 보내기 전에 폰트를 한 번만 올려 다이어리에 공유한다', async () => {
  const f = fixture()
  await f.fonts.prepare(body([textRow(`personal-${fileId}`)]))
  await f.fonts.prepare(body([textRow(`personal-${fileId}`)]))
  assert.equal(f.uploads(), 1)
  const shares = f.calls.filter(call => call.method === 'POST' && call.path === `/diaries/${diaryId}/fonts`)
  assert.deepEqual(shares.map(call => call.body), [{ mediaFileId }])
  assert.equal(f.disk.get(`uploads:${fileId}`), mediaFileId)
})

test('다른 다이어리에서는 이미 올린 파일을 다시 올리지 않고 공유만 한다', async () => {
  const first = fixture()
  await first.fonts.prepare(body([textRow(`personal-${fileId}`)]))
  const second = fixture()
  second.disk.set(`uploads:${fileId}`, mediaFileId)
  await second.fonts.prepare(body([textRow(`personal-${fileId}`)]))
  assert.equal(second.uploads(), 0)
  assert.equal(second.calls.filter(call => call.path === `/diaries/${diaryId}/fonts`).length, 1)
})

test('서버에서 지워진 폰트 파일이면 다시 올려 공유한다', async () => {
  const f = fixture({ shareFailure: Object.assign(Error('missing'), { status: 404 }) })
  f.disk.set(`uploads:${fileId}`, 'aaaaaaaa-0000-4000-8000-000000000000')
  await f.fonts.prepare(body([textRow(`personal-${fileId}`)]))
  assert.equal(f.uploads(), 1)
  assert.equal(f.disk.get(`uploads:${fileId}`), mediaFileId)
})

test('친구 폰트 · 실패한 업로드는 글자 저장을 막지 않는다', async () => {
  const friend = fixture({ mine: [] })
  await friend.fonts.prepare(body([textRow(`personal-${otherId}`)]))
  assert.equal(friend.uploads(), 0)
  const failing = fixture({ shareFailure: Object.assign(Error('offline'), { status: 0 }) })
  await failing.fonts.prepare(body([textRow(`personal-${fileId}`)]))
  // 실패한 공유는 기억하지 않고 다음 저장에서 다시 시도한다
  await failing.fonts.prepare(body([textRow(`personal-${fileId}`)]))
  assert.equal(failing.calls.filter(call => call.method === 'POST' && call.path === `/diaries/${diaryId}/fonts`).length, 2)
})

test('다이어리 폰트 목록에서 기기에 없는 폰트만 받아 등록한다', async () => {
  const f = fixture({ mine: [], has: id => id === otherId, serverFonts: [
    { mediaFileId, name: sharedFontFileName(fileId), enabled: true },
    { mediaFileId: otherMediaId, name: sharedFontFileName(otherId), enabled: true },
    { mediaFileId: '30000000-0000-4000-8000-000000000003', name: 'other.ttf', enabled: true },
    { mediaFileId: '30000000-0000-4000-8000-000000000004', name: sharedFontFileName('20000000-0000-4000-8000-000000000003'), enabled: false },
  ] })
  await f.fonts.sync()
  assert.deepEqual(f.registered, [{ fileId, uri: `file://shared/${fileId}.ttf` }])
  assert.deepEqual(f.calls.filter(call => call.path?.endsWith('/file')).map(call => call.path), [`/diaries/${diaryId}/fonts/${mediaFileId}/file`])
})

test('받은 요소에 못 그리는 폰트가 있으면 목록을 다시 받되 잦은 요청은 건너뛴다', async () => {
  const f = fixture({ mine: [], serverFonts: [] })
  const rows = [textRow(`personal-${fileId}`)]
  await f.fonts.hydrate(rows)
  await f.fonts.hydrate(rows)
  const lists = () => f.calls.filter(call => !call.method && call.path === `/diaries/${diaryId}/fonts`).length
  assert.equal(lists(), 1)
  f.tick(10000)
  await f.fonts.hydrate(rows)
  assert.equal(lists(), 2)
  await f.fonts.hydrate([textRow('nanum-gothic')])
  assert.equal(lists(), 2)
})

test('canvasMedia 에 붙이면 이미지 처리 전에 폰트를 공유한다', async () => {
  const order = []
  const media = { prepare: async request => { order.push('media'); return request }, hydrate: async rows => rows, dispose() {} }
  const fonts = { prepare: async () => { order.push('fonts') }, hydrate: async () => {} }
  const wrapped = withDiaryFonts(media, fonts)
  const request = body([textRow(`personal-${fileId}`)])
  assert.equal(await wrapped.prepare(request), request)
  assert.deepEqual(order, ['fonts', 'media'])
  assert.equal(typeof wrapped.dispose, 'function')
})

test('미디어 요청은 다이어리 폰트 파일 경로를 받는다', async () => {
  const seen = []
  const auth = { getSessionKey: () => 's', getAccessToken: async () => 't', getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }) }
  const request = createMediaRequest({ auth, accountId: '1', sessionKey: 's', baseUrl: 'https://qa.test/api/v1', fetchImpl: async url => { seen.push(url); return { ok: true, status: 200, headers: { get: () => '4' }, arrayBuffer: async () => new Uint8Array([0, 1, 0, 0]).buffer } } })
  await request(`/diaries/${diaryId}/fonts/${mediaFileId}/file`, { binary: true })
  assert.deepEqual(seen, [`https://qa.test/api/v1/diaries/${diaryId}/fonts/${mediaFileId}/file`])
  await assert.rejects(request(`/diaries/${diaryId}/members`), /경로/)
})
