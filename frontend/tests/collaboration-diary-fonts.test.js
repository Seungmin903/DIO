import test from 'node:test'
import assert from 'node:assert/strict'
import { createDiaryFonts, fileIdFromSharedName, isFontBytes, personalFontIds, sharedFontFileName, withDiaryFonts } from '../src/collaboration/diaryFonts.js'
import { clearSharedTextFonts, getPickableTextFonts, getTextFonts, registerPersonalTextFonts, registerSharedTextFonts } from '../src/editor/utils/text.js'
import { createMediaRequest } from '../src/collaboration/canvasMedia.js'

const diaryId = '10000000-0000-4000-8000-000000000001'
const fileId = '20000000-0000-4000-8000-000000000001', otherId = '20000000-0000-4000-8000-000000000002'
const mediaFileId = '30000000-0000-4000-8000-000000000001', otherMediaId = '30000000-0000-4000-8000-000000000002'
const textRow = (font, elementType = 'TEXT') => ({ elementType, propertiesJson: { text: '안녕', font } })
const body = rows => ({ clientOperationId: 'op', changes: { creates: rows }, expectedVersions: {} })

const TTF = new Uint8Array([0, 1, 0, 0, 0, 10, 0, 128, 0, 3, 0, 32])
function fixture({ mine = [{ id: `personal-${fileId}`, fileId, uri: 'file://font.ttf' }], has = () => false, serverFonts = [], shareFailure = null, fileBytes = () => TTF, consent } = {}) {
  const disk = new Map(), calls = [], registered = [], saved = new Map(), timers = []
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
    if (/\/fonts\/[0-9a-f-]+\/file$/.test(path)) { assert.equal(options.binary, true); return fileBytes(path) }
    throw Error(`예상하지 않은 파일 요청 ${path}`)
  }
  const fonts = createDiaryFonts({
    diaryId, transport, request, storage: { getItem: async k => disk.get(k) ?? null, setItem: async (k, v) => disk.set(k, v), removeItem: async k => disk.delete(k) }, key: 'uploads',
    files: { upload: async font => ({ font }), cachedUri: async id => saved.get(id) ?? null, save: async (id, bytes) => { saved.set(id, `file://shared/${id}.ttf`); return saved.get(id) } },
    library: { mine: async () => mine, has, register: list => registered.push(...list) },
    now: () => now, consent,
    setTimer: (run, ms) => { const timer = { run, ms, cleared: false }; timers.push(timer); return timer },
    clearTimer: timer => { timer.cleared = true },
  })
  return { fonts, calls, registered, disk, saved, timers, uploads: () => uploads, tick: ms => { now += ms } }
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

const settle = () => new Promise(resolve => setImmediate(resolve))
const shares = f => f.calls.filter(call => call.method === 'POST' && call.path === `/diaries/${diaryId}/fonts`).length

test('동의를 묻지 않은 계정은 글자 저장을 기다리게 하지 않고 한 번만 묻고, 공유하기면 그때 올린다', async () => {
  let state = null, asks = 0, answer
  const f = fixture({ consent: { status: async () => state, ask: () => { asks++; return new Promise(resolve => { answer = granted => { state = granted ? 'granted' : 'denied'; resolve(granted) } }) } } })
  await f.fonts.prepare(body([textRow(`personal-${fileId}`)]))
  await f.fonts.prepare(body([textRow(`personal-${fileId}`)]))
  await settle()
  assert.equal(asks, 1)
  assert.equal(f.uploads(), 0)
  answer(true); await settle(); await settle()
  assert.equal(f.uploads(), 1)
  assert.equal(shares(f), 1)
})

test('공유 안 함을 고르거나 끈 계정은 올리지 않는다', async () => {
  let asks = 0
  const declined = fixture({ consent: { status: async () => null, ask: async () => { asks++; return false } } })
  await declined.fonts.prepare(body([textRow(`personal-${fileId}`)]))
  await settle(); await settle()
  assert.equal(asks, 1)
  assert.equal(declined.uploads(), 0)
  const off = fixture({ consent: { status: async () => 'denied', ask: async () => { asks++; return true } } })
  await off.fonts.prepare(body([textRow(`personal-${fileId}`)]))
  await settle()
  assert.equal(asks, 1)
  assert.equal(off.uploads(), 0)
  assert.equal(shares(off), 0)
})

test('친구 폰트는 동의를 묻지 않는다', async () => {
  let asks = 0
  const f = fixture({ mine: [], consent: { status: async () => null, ask: async () => { asks++; return true } } })
  await f.fonts.prepare(body([textRow(`personal-${otherId}`)]))
  await settle()
  assert.equal(asks, 0)
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
  // 캐시는 서버 파일 id 기준
  assert.deepEqual(f.registered, [{ fileId, mediaFileId, uri: `file://shared/${mediaFileId}.ttf` }])
  assert.deepEqual(f.calls.filter(call => call.path?.endsWith('/file')).map(call => call.path), [`/diaries/${diaryId}/fonts/${mediaFileId}/file`])
})

test('같은 폰트 id 를 단 파일이 여럿이면 먼저 공유된 파일만 받는다', async () => {
  const f = fixture({ mine: [], serverFonts: [
    { mediaFileId, name: sharedFontFileName(fileId), enabled: true },
    { mediaFileId: otherMediaId, name: sharedFontFileName(fileId), enabled: true },
  ] })
  await f.fonts.sync()
  assert.deepEqual(f.registered.map(font => font.mediaFileId), [mediaFileId])
  assert.deepEqual([...f.saved.keys()], [mediaFileId])
})

test('폰트 형식이 아닌 파일은 저장 · 등록하지 않는다', async () => {
  const f = fixture({ mine: [], serverFonts: [{ mediaFileId, name: sharedFontFileName(fileId), enabled: true }], fileBytes: () => new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0, 0, 0, 0, 0, 0, 0]) })
  await f.fonts.sync()
  assert.deepEqual(f.registered, [])
  assert.equal(f.saved.size, 0)
})

test('받은 요소에 못 그리는 폰트가 있으면 목록을 다시 받고, 막 받은 직후면 남은 시간 뒤에 한 번 받는다', async () => {
  const f = fixture({ mine: [], serverFonts: [] })
  const rows = [textRow(`personal-${fileId}`)]
  const lists = () => f.calls.filter(call => !call.method && call.path === `/diaries/${diaryId}/fonts`).length
  await f.fonts.sync()
  assert.equal(lists(), 1)
  // 3초 뒤 글자가 도착: 바로 받지 않고 7초 뒤로 한 번만 예약한다
  f.tick(3000)
  await f.fonts.hydrate(rows)
  await f.fonts.hydrate(rows)
  assert.equal(lists(), 1)
  assert.deepEqual(f.timers.map(timer => timer.ms), [7000])
  f.tick(7000)
  f.timers[0].run()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(lists(), 2)
  // 내 글꼴로 그릴 수 있는 글자는 다시 받지 않는다
  f.tick(10000)
  await f.fonts.hydrate([textRow('nanum-gothic')])
  assert.equal(lists(), 2)
  f.tick(10000)
  await f.fonts.hydrate(rows)
  assert.equal(lists(), 3)
})

test('세션을 닫으면 예약한 재조회를 멈추고 더 받지 않는다', async () => {
  const f = fixture({ mine: [], serverFonts: [] })
  await f.fonts.sync()
  f.tick(1000)
  await f.fonts.hydrate([textRow(`personal-${fileId}`)])
  f.fonts.dispose()
  assert.equal(f.timers[0].cleared, true)
  await f.fonts.sync()
  assert.equal(f.calls.filter(call => !call.method && call.path === `/diaries/${diaryId}/fonts`).length, 1)
})

test('캐시 정리가 끝난 뒤에 목록을 받는다', async () => {
  let release
  const ready = new Promise(resolve => { release = resolve })
  const calls = []
  const fonts = createDiaryFonts({ diaryId, ready, key: 'k', storage: {}, files: {}, request: async () => {},
    transport: async request => { calls.push(request.path); return [] }, library: { mine: async () => [], has: () => false, register() {} } })
  const job = fonts.sync()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(calls, [])
  release(); await job
  assert.deepEqual(calls, [`/diaries/${diaryId}/fonts`])
})

test('폰트 파일 머리를 확인한다', () => {
  assert.equal(isFontBytes(TTF), true)
  assert.equal(isFontBytes(new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 0, 0, 0, 0, 0, 0, 0, 0])), true)
  assert.equal(isFontBytes(new Uint8Array([0, 1, 0, 0])), false)
  assert.equal(isFontBytes(new Uint8Array(12)), false)
})

test('canvasMedia 에 붙이면 이미지 처리 전에 폰트를 공유하고 닫을 때 둘 다 정리한다', async () => {
  const order = []
  const media = { prepare: async request => { order.push('media'); return request }, hydrate: async rows => rows, dispose() { order.push('media-dispose') } }
  const fonts = { prepare: async () => { order.push('fonts') }, hydrate: async () => {}, dispose() { order.push('fonts-dispose') } }
  const wrapped = withDiaryFonts(media, fonts)
  const request = body([textRow(`personal-${fileId}`)])
  assert.equal(await wrapped.prepare(request), request)
  wrapped.dispose()
  assert.deepEqual(order, ['fonts', 'media', 'fonts-dispose', 'media-dispose'])
})

test('받은 친구 폰트는 고르기 목록에 없고, 세션을 닫으면 그리는 목록에서도 빠진다', () => {
  const friend = { id: `personal-${otherId}`, family: `DIOHW_${otherId.replaceAll('-', '')}` }
  const mineFont = { id: `personal-${fileId}`, label: '내 폰트', family: `DIOHW_${fileId.replaceAll('-', '')}` }
  registerPersonalTextFonts([mineFont])
  registerSharedTextFonts([friend, { id: mineFont.id, family: mineFont.family }])
  assert.ok(getTextFonts().some(font => font.id === friend.id))
  assert.ok(!getPickableTextFonts().some(font => font.id === friend.id))
  // 내 폰트와 같은 id 는 내 폰트 하나만 남는다
  assert.equal(getTextFonts().filter(font => font.id === mineFont.id).length, 1)
  clearSharedTextFonts()
  assert.ok(!getTextFonts().some(font => font.id === friend.id))
  assert.ok(getTextFonts().some(font => font.id === mineFont.id))
  registerPersonalTextFonts([])
})

test('미디어 요청은 다이어리 폰트 파일 경로를 받는다', async () => {
  const seen = []
  const auth = { getSessionKey: () => 's', getAccessToken: async () => 't', getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }) }
  const request = createMediaRequest({ auth, accountId: '1', sessionKey: 's', baseUrl: 'https://qa.test/api/v1', fetchImpl: async url => { seen.push(url); return { ok: true, status: 200, headers: { get: () => '4' }, arrayBuffer: async () => new Uint8Array([0, 1, 0, 0]).buffer } } })
  await request(`/diaries/${diaryId}/fonts/${mediaFileId}/file`, { binary: true })
  assert.deepEqual(seen, [`https://qa.test/api/v1/diaries/${diaryId}/fonts/${mediaFileId}/file`])
  await assert.rejects(request(`/diaries/${diaryId}/members`), /경로/)
})
