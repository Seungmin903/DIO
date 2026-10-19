import { Platform } from 'react-native'
import { selectImages } from './mediaPicker'
import { importMedia, makePoster, mediaService } from './mediaStore'
import { MediaError } from './mediaPolicy.js'
import { attachMediaPreviews } from './mediaImport.js'

let picking = false
/** 선택 → 실제 파일 검사 → 원본 영구 보관. 취소하면 []이며 저장하지 않는다. */
export async function pickImages({ multiple = true, usage = 'photo' } = {}) {
  if (picking) return []
  picking = true
  try {
    // 웹은 클릭에서 바로 열어야 한다. GIF 보존을 위해 자르기·압축을 끈다.
    const result = await selectImages({ multiple })
    if (result.canceled) return []
    const items = await importMedia(result.assets ?? [], { usage })
    return await attachMediaPreviews(items, async (media) => {
      // 네이티브는 아직 poster를 생성하지 않으므로 불필요한 원본 재조회를 생략한다.
      if (Platform.OS !== 'web') return null
      const { blob, displayBlob } = await mediaService.get(media.mediaFileId)
      return makePoster(displayBlob ?? blob)
    })
  } catch (error) {
    if (error instanceof MediaError) throw error
    throw new MediaError('PICKER_FAILED', '사진 보관함을 열지 못했어요. 접근 권한을 확인하고 다시 시도해 주세요.', error)
  } finally { picking = false }
}
