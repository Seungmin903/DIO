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
  const storage = { getItem: async key => records.get(key) ?? null, getAllKeys: async () => [] }
  const ids = await guestPhotoIds(storage, async options => {
    assert.equal(options.idsOnly, true)
    return [{ id: 'cover' }]
  })
  assert.deepEqual([...ids], ['cover'])
})
