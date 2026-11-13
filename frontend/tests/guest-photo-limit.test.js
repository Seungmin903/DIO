import test from 'node:test'
import assert from 'node:assert/strict'
import { guestPhotoIds, checkGuestPhotoCapacity, rememberGuestPhotos } from '../src/editor/services/guestPhotoLimit.js'
import { STORAGE_KEYS } from '../src/editor/utils/storageContract.js'

test('기존 문서와 최근 사진을 합산하고 200번째까지 저장하며 취소로 삭제된 사진은 제외한다', async () => {
  const records = new Map([
    [`${STORAGE_KEYS.doc}:old`, JSON.stringify({ pages: [{ objects: [{ type: 'photo', mediaFileId: 'old' }] }] })],
    [STORAGE_KEYS.customDecor, JSON.stringify({ recentPhotos: [{ mediaFileId: 'old' }] })],
  ])
  const storage = {
    getItem: async key => records.get(key) ?? null,
    setItem: async (key, value) => records.set(key, value),
    getAllKeys: async () => [...records.keys()],
  }
  const photos = Array.from({ length: 199 }, (_, i) => ({ mediaFileId: String(i) }))
  let available = [{ id: 'old' }, ...photos.map(photo => ({ id: photo.mediaFileId }))]
  let ids = await guestPhotoIds(storage, async () => available)
  assert.equal(ids.size, 1)
  checkGuestPhotoCapacity(ids, 199)
  await rememberGuestPhotos(storage, ids, photos)
  ids = await guestPhotoIds(storage, async () => available)
  assert.equal(ids.size, 200)
  assert.throws(() => checkGuestPhotoCapacity(ids), { code: 'STORAGE_LIMIT_REACHED' })
  available = available.filter(photo => photo.id !== '0')
  ids = await guestPhotoIds(storage, async () => available)
  checkGuestPhotoCapacity(ids)
  assert.equal(ids.size, 199)
})

test('기존 게스트 표지 사진도 한도에 포함하고 같은 파일은 한 번만 센다', async () => {
  const records = new Map([
    [STORAGE_KEYS.diaries, JSON.stringify([{ cover: { photo: { mediaFileId: 'cover' } } }])],
    [STORAGE_KEYS.customDecor, JSON.stringify({ recentPhotos: [{ mediaFileId: 'cover' }] })],
  ])
  const storage = { getItem: async key => records.get(key) ?? null, getAllKeys: async () => [], setItem: async (key, value) => records.set(key, value) }
  const ids = await guestPhotoIds(storage, async options => {
    assert.equal(options.idsOnly, true)
    return [{ id: 'cover' }]
  })
  assert.deepEqual([...ids], ['cover'])
  storage.getAllKeys = () => { throw Error('인덱스가 있으면 문서를 다시 훑지 않는다') }
  assert.deepEqual([...await guestPhotoIds(storage, async () => [{ id: 'cover' }])], ['cover'])
})

test('손상 문서를 보존하고 남은 파일을 보수적으로 세며 문서 복구 후 다시 집계한다', async () => {
  const records = new Map([[STORAGE_KEYS.doc, '{broken']])
  const storage = {
    getItem: async key => records.get(key) ?? null,
    getAllKeys: async () => [STORAGE_KEYS.doc],
    setItem: async (key, value) => records.set(key, value),
  }
  const entries = async () => [{ id: 'photo' }, { id: 'unknown' }]
  const ids = await guestPhotoIds(storage, entries)
  assert.equal(ids.size, 2)
  checkGuestPhotoCapacity(ids)
  assert.equal(records.get(STORAGE_KEYS.doc), '{broken')
  await rememberGuestPhotos(storage, ids, [{ mediaFileId: 'new' }])
  assert.equal(JSON.parse(records.get('dio:guest:photo-library:v1')).needsRescan, true)
  records.set(STORAGE_KEYS.doc, JSON.stringify({ pages: [{ objects: [{ type: 'photo', mediaFileId: 'photo' }] }] }))
  const repaired = await guestPhotoIds(storage, async () => [...await entries(), { id: 'new' }])
  assert.deepEqual([...repaired].sort(), ['new', 'photo', 'unknown'])
  // 사진인지 확정하지 못한 파일은 실제로 지워지기 전까지 집계에서 빼지 않는다.
  const deleted = await guestPhotoIds(storage, async () => [{ id: 'new' }, { id: 'photo' }])
  assert.deepEqual([...deleted].sort(), ['new', 'photo'])
})

for (const raw of ['{broken', '{}', '[42]']) test(`손상된 파생 인덱스 ${raw}는 원본을 지우지 않고 재생성한다`, async () => {
  const original = JSON.stringify({ pages: [{ objects: [{ type: 'photo', mediaFileId: 'photo' }] }] })
  const records = new Map([['dio:guest:photo-library:v1', raw], [STORAGE_KEYS.doc, original]])
  const storage = { getItem: async key => records.get(key) ?? null, getAllKeys: async () => [STORAGE_KEYS.doc], setItem: async (key, value) => records.set(key, value) }
  assert.deepEqual([...await guestPhotoIds(storage, async () => [{ id: 'photo' }])], ['photo'])
  assert.equal(JSON.parse(records.get('dio:guest:photo-library:v1')).version, 2)
  assert.equal(records.get(STORAGE_KEYS.doc), original)
})

test('선택창 밖에서 저장한 사진은 새 파일이 발견되면 문서를 다시 읽어 집계한다', async () => {
  const records = new Map()
  let scans = 0
  const storage = {
    getItem: async key => records.get(key) ?? null,
    getAllKeys: async () => { scans++; return [...records.keys()] },
    setItem: async (key, value) => records.set(key, value),
  }
  await guestPhotoIds(storage, async () => [])
  const photos = Array.from({ length: 200 }, (_, id) => ({ type: 'photo', mediaFileId: String(id) }))
  records.set(STORAGE_KEYS.doc, JSON.stringify({ pages: [{ objects: photos }] }))
  const entries = async () => [...photos.map(photo => ({ id: photo.mediaFileId })), { id: 'sticker' }]
  const ids = await guestPhotoIds(storage, entries)
  assert.equal(ids.size, 200)
  assert.throws(() => checkGuestPhotoCapacity(ids), { code: 'STORAGE_LIMIT_REACHED' })
  assert.equal((await guestPhotoIds(storage, entries)).size, 200)
  assert.equal(scans, 2)
})

test('기존 배열 인덱스를 기존 문서와 합쳐 새 인덱스로 한 번만 옮긴다', async () => {
  const records = new Map([
    ['dio:guest:photo-library:v1', JSON.stringify(['saved'])],
    [STORAGE_KEYS.doc, JSON.stringify({ pages: [{ objects: [{ type: 'photo', mediaFileId: 'older' }] }] })],
  ])
  let scans = 0
  const storage = {
    getItem: async key => records.get(key) ?? null,
    getAllKeys: async () => { scans++; return [STORAGE_KEYS.doc] },
    setItem: async (key, value) => records.set(key, value),
  }
  const entries = async () => [{ id: 'saved' }, { id: 'older' }]
  assert.equal((await guestPhotoIds(storage, entries)).size, 2)
  assert.equal((await guestPhotoIds(storage, entries)).size, 2)
  assert.equal(scans, 1)
})
