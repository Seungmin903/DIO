import { Platform } from 'react-native'
import { selectImages } from '../utils/mediaPicker'
import { importMedia, makePoster, mediaService } from './mediaStore'
import { MediaError } from '../utils/mediaPolicy.js'
import { attachMediaPreviews } from '../utils/mediaImport.js'
import { createPoster } from '../utils/mediaProcessing'

// 정지 이미지 긴 변. 페이지 썸네일뿐 아니라 캔버스에서 끄는 동안에도 보여서 너무 작으면 흐리다.
const POSTER_SIZE = 320

let picking = false
/** 선택 → 실제 파일 검사 → 원본 영구 보관. 취소하면 []이며 저장하지 않는다. */
export async function pickImages({ multiple = true, usage = 'photo', sharedGifMaxBytes } = {}) {
  if (picking) return []
  picking = true
  try {
    // 웹은 클릭에서 바로 열어야 한다. GIF 보존을 위해 자르기·압축을 끈다.
    const result = await selectImages({ multiple })
    if (result.canceled) return []
    const items = await importMedia(result.assets ?? [], { usage, sharedGifMaxBytes })
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
  } catch (error) {
    if (error instanceof MediaError) throw error
    throw new MediaError('PICKER_FAILED', '사진 보관함을 열지 못했어요. 다시 시도해 주세요.', error)
  } finally { picking = false }
}
