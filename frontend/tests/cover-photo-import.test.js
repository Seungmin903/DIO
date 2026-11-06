import test from 'node:test'
import assert from 'node:assert/strict'
import { coverPhotoWithAspect, coverCropPhoto, COVER_PHOTO_RATIO } from '../src/diary/utils/coverPhotoCrop.js'
import { coverWithPdfPage, pdfOrientation } from '../src/diary/utils/pdfImport.js'
import { newDiaryCover, normalizeCover } from '../src/diary/utils/coverDesign.js'

test('가져온 가로 사진은 가로 표지로 만들고 자른 위치와 비율을 보존한다', () => {
  const item = { src: 'media:test', mediaFileId: 'test', width: 1600, height: 900 }
  const photo = coverPhotoWithAspect(item)
  const orientation = pdfOrientation(photo.aspect)
  assert.equal(orientation, 'landscape')
  assert.equal(coverCropPhoto(photo, COVER_PHOTO_RATIO[orientation]).imageWidth, 1600)
  const crop = { fx: 0.8, fy: 0.2, zoom: 1.5 }
  const base = coverWithPdfPage(newDiaryCover(), photo)
  const saved = normalizeCover({ cover: { ...base, photo: { ...base.photo, crop } } })
  assert.equal(saved.photo.aspect, 1600 / 900)
  assert.deepEqual(saved.photo.crop, crop)
})

test('사진 크기가 없거나 유효하지 않으면 잘못된 표지를 저장하지 않는다', () => {
  for (const photo of [{}, { width: 100, height: 0 }, { width: Infinity, height: 10 }, { width: -1, height: 10 }]) {
    assert.throws(() => coverPhotoWithAspect(photo), /사진 크기/)
  }
})
