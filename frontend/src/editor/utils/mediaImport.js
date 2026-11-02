import { checkDimensions, checkSize, detectMediaType, MediaError, storageError } from './mediaPolicy.js'

/**
 * 사진 이름(레이어 이름): 파일 이름에서 확장자를 뺀 것. 사람이 붙인 이름이 아니면 null 이다 —
 * 파일 이름이 없어 대신 채운 'image', 안드로이드 사진 보관함의 숫자 id(1000012345), 캐시 파일의 무작위 이름(UUID · 긴 16진수).
 * null 이면 캔버스에 넣을 때 '사진 1', '사진 2'… 로 번호를 붙인다(editorReducer addObjects).
 */
export function mediaDisplayName(originalName) {
  const base = String(originalName ?? '').replace(/\.[^.]+$/, '').trim()
  if (!base || /^image$/i.test(base) || /^\d+$/.test(base)) return null
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base) || /^[0-9a-f_-]{16,}$/i.test(base)) return null
  return base
}

/** 썸네일은 선택 사항이다. 저장 완료된 원본은 썸네일 실패와 관계없이 화면에 전달한다. */
export async function attachMediaPreviews(items, loadPoster) {
  const results = []
  for (const media of items) {
    let poster = null
    try { poster = await loadPoster(media) } catch { /* 원본 src로 표시한다. */ }
    results.push({ ...media, poster, name: mediaDisplayName(media.originalName) })
  }
  return results
}

export function createMediaImporter({ readAsset, decode, createDisplay, dispose, save, remove, createId }) {
  return async function importMany(assets, { usage = 'photo' } = {}) {
    const saved = []
    try {
      // 디코딩·축소·저장을 한 장씩 처리해 여러 고해상도 디코딩 결과가 메모리에 쌓이지 않게 한다.
      for (const asset of assets) {
        if (asset.fileSize != null) checkSize(asset.fileSize)
        const input = await readAsset(asset)
        try {
          checkSize(input.size)
          const format = detectMediaType(input.header)
          checkSize(input.size, format)
          if (asset.width > 0 && asset.height > 0) checkDimensions(asset, format)
          let dimensions
          try { dimensions = await decode(input, format) } catch (error) {
            if (error instanceof MediaError) throw error
            throw new MediaError('MEDIA_DECODE_FAILED', '손상되었거나 표시할 수 없는 이미지예요.', error)
          }
          checkDimensions(dimensions, format)
          let display = null
          try {
            if (format.extension !== 'gif' && createDisplay) display = await createDisplay(input, format, dimensions, usage)
          } catch (error) {
            throw new MediaError('MEDIA_PROCESS_FAILED', '이미지 표시용 파일을 만들지 못했어요. 다시 시도해 주세요.', error)
          }
          const metadata = {
            mediaFileId: createId(), originalName: asset.fileName || `image.${format.extension}`,
            ...format, fileSize: input.size, ...dimensions, createdAt: new Date().toISOString(),
            // opaque: 투명한 곳이 없는 그림(PDF 쪽)이라, 공유할 때 크면 JPEG 로 낮춰 올릴 수 있다.
            ...(asset.opaque ? { opaque: true } : {}),
            ...(display ? { display: display.metadata } : {}),
          }
          const uri = await save(input.source, metadata, display)
          saved.push({ ...metadata, uri })
        } finally { await dispose?.(input) }
      }
      return saved
    } catch (error) {
      await Promise.allSettled(saved.map((item) => remove(item.mediaFileId, item.uri)))
      throw storageError(error)
    }
  }
}
