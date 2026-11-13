import { Platform } from 'react-native'
import { selectImages } from '../utils/mediaPicker'
import { importMedia, makePoster, mediaService } from './mediaStore'
import { MediaError } from '../utils/mediaPolicy.js'
import { attachMediaPreviews } from '../utils/mediaImport.js'
import { createPoster } from '../utils/mediaProcessing'
import documentStorage from './documentStorage'
import { entries } from '../utils/mediaRepository'
import { guestPhotoIds, checkGuestPhotoCapacity, rememberGuestPhotos } from './guestPhotoLimit.js'
import { discardGeneratedMedia } from './mediaStore'
import { authService } from '../../auth/authService'

// 정지 이미지 긴 변. 페이지 썸네일뿐 아니라 캔버스에서 끄는 동안에도 보여서 너무 작으면 흐리다.
const POSTER_SIZE = 320

let picking = false
/** 선택 → 실제 파일 검사 → 원본 영구 보관. 취소하면 []이며 저장하지 않는다. */
export async function pickImages({ multiple = true, usage = 'photo', sharedGifMaxBytes, guestPhoto: localPhoto = false, checkPhotoCapacity } = {}) {
  if (picking) return []
  // 로그인 후 기기에 남은 게스트 문서도 지원하되 비로그인은 호출 옵션과 무관하게 검사한다.
  const guestPhoto = localPhoto || !authService.getSessionKey()
  picking = true
  const checkCapacity = async (...args) => {
    try { return await checkPhotoCapacity?.(...args) }
    catch (error) {
      if (['STORAGE_LIMIT_REACHED', 'GUEST_PHOTO_INDEX_DAMAGED', 'MEMBER_PHOTO_INDEX_DAMAGED', 'PHOTO_LIBRARY_NOT_READY'].includes(error?.code)) throw error
      throw Object.assign(new Error('사진 보관함을 확인하지 못했어요. 다시 시도해 주세요.', { cause: error }), { code: 'PHOTO_CAPACITY_CHECK_FAILED' })
    }
  }
  try {
    // 웹 파일 선택창은 사용자 클릭이 살아 있는 동안 동기적으로 열어야 한다.
    const webSelection = Platform.OS === 'web' ? selectImages({ multiple }) : null
    if (webSelection) {
      const result = await webSelection
      if (result.canceled) return []
      return await importSelected(result)
    }
    const guestIds = guestPhoto && usage === 'photo' ? await guestPhotoIds(documentStorage, entries) : null
    if (guestIds) checkGuestPhotoCapacity(guestIds)
    if (usage === 'photo') await checkCapacity(1)
    // 웹은 클릭에서 바로 열어야 한다. GIF 보존을 위해 자르기·압축을 끈다.
    const result = await selectImages({ multiple })
    if (result.canceled) return []
    return await importSelected(result, guestIds)
  } catch (error) {
    if (error instanceof MediaError || ['STORAGE_LIMIT_REACHED', 'GUEST_PHOTO_INDEX_DAMAGED', 'MEMBER_PHOTO_INDEX_DAMAGED', 'PHOTO_LIBRARY_NOT_READY', 'PHOTO_CAPACITY_CHECK_FAILED'].includes(error.code)) throw error
    throw new MediaError('PICKER_FAILED', '사진 보관함을 열지 못했어요. 다시 시도해 주세요.', error)
  } finally { picking = false }

  async function importSelected(result, guestIds) {
    if (guestPhoto && usage === 'photo' && !guestIds) guestIds = await guestPhotoIds(documentStorage, entries)
    if (guestIds) checkGuestPhotoCapacity(guestIds, result.assets?.length ?? 0)
    if (usage === 'photo') await checkCapacity(result.assets?.length ?? 0)
    const items = await importMedia(result.assets ?? [], { usage, sharedGifMaxBytes })
    if (usage === 'photo' && checkPhotoCapacity) {
      try { await checkCapacity(0, items) }
      catch (error) { await discardGeneratedMedia(items); throw error }
    }
    if (guestIds) {
      try { await rememberGuestPhotos(documentStorage, guestIds, items) }
      catch (error) { await discardGeneratedMedia(items); throw error }
    }
    return await attachMediaPreviews(items, async (media) => {
      // 네이티브는 움직이는 GIF 만 첫 장면을 만든다. 정지 사진은 원본(표시본)을 그대로 써도 가볍다.
      if (Platform.OS !== 'web') {
        if (media.extension !== 'gif') return null
        const { blob } = await mediaService.get(media.mediaFileId)
        return createPoster(blob.uri, POSTER_SIZE)
      }
      const { blob, displayBlob } = await mediaService.get(media.mediaFileId)
      return makePoster(displayBlob ?? blob, POSTER_SIZE)
    })
  }
}
