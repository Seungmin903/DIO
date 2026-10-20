/** 화면 줌·선택 상태·저장 지연과 독립적인 출력 입력. 현재 로컬 요소 배열은 뒤→앞 순서다. */
export class PageExportError extends Error {
  constructor(code, message, cause) { super(message); this.name = 'PageExportError'; this.code = code; this.cause = cause }
}

export function createExportSnapshot(page, { width = 1188, height = 840, scale = 1 } = {}) {
  if (![width, height, scale].every((n) => Number.isFinite(n) && n > 0)) throw new PageExportError('EXPORT_SIZE_INVALID', '페이지 크기를 확인해 주세요.')
  const ratio = Math.min(scale, 4096 / width, 4096 / height, Math.sqrt(8000000 / (width * height)))
  const pixelWidth = Math.max(1, Math.floor(width * ratio)), pixelHeight = Math.max(1, Math.floor(height * ratio))
  if (!page || !Array.isArray(page.objects)) throw new PageExportError('EXPORT_PAGE_INVALID', '페이지를 읽지 못했어요.')
  const objects = page.objects.filter((o) => !o.hidden && o.opacity !== 0).map((object) => {
    if (!['photo', 'sticker', 'tape', 'stroke'].includes(object.type)) throw new PageExportError('EXPORT_ELEMENT_UNSUPPORTED', '아직 내보낼 수 없는 요소가 있어요.')
    if (object.type === 'stroke' && (
      !Array.isArray(object.points) || !object.points.length ||
      object.points.some((p) => !Number.isFinite(p?.x) || !Number.isFinite(p?.y) || (p.pressure != null && (!Number.isFinite(p.pressure) || p.pressure <= 0 || p.pressure > 2.3))) ||
      ![object.baseWidth, object.baseHeight, object.strokeWidth].every((n) => Number.isFinite(n) && n > 0)
    )) throw new PageExportError('EXPORT_GEOMETRY_INVALID', '필기 좌표를 확인해 주세요.')
    if (![object.x, object.y, object.w, object.h, object.rotation ?? 0].every(Number.isFinite) || object.w <= 0 || object.h <= 0) throw new PageExportError('EXPORT_GEOMETRY_INVALID', '요소의 위치와 크기를 확인해 주세요.')
    return JSON.parse(JSON.stringify(object))
  })
  // 현재 편집기는 불투명 흰 종이만 제공한다. 보조 격자·UI 속성은 출력 입력에 넣지 않는다.
  return { pageId: page.id, width, height, pixelWidth, pixelHeight, background: '#FFFFFF', objects }
}

/** 출력 작업이 만든 임시 참조만 소유한다. 화면 표시 캐시/원본 파일은 건드리지 않는다. */
export async function prepareExportSnapshot(snapshot, resolveImage) {
  const resources = []
  const cache = new Map()
  const keyOf = (o) => o.mediaFileId ? `media:${o.mediaFileId}` : o.asset ? `asset:${o.asset}` : o.src
  const usages = new Map()
  snapshot.objects.forEach((o) => { const key = keyOf(o); if (key) usages.set(key, [...(usages.get(key) ?? []), o]) })
  try {
    const objects = []
    for (const object of snapshot.objects) {
      const key = keyOf(object)
      if (!key) { objects.push(object); continue }
      let resource = cache.get(key)
      if (!resource) {
        try { resource = await resolveImage(object, usages.get(key)) }
        catch (error) {
          if (['EXPORT_GIF_DECODE_FAILED', 'EXPORT_GIF_TOO_LARGE'].includes(error?.code)) throw new PageExportError(error.code, `‘${object.name || object.asset || object.id}’ ${error.message}`, error)
          throw error
        }
        resources.push(resource)
        cache.set(key, resource)
      }
      objects.push({ ...object, src: resource.uri, mediaFileId: undefined, asset: undefined, poster: undefined })
    }
    let active = true
    return { ...snapshot, objects, dispose() { if (!active) return; active = false; resources.forEach((r) => r.dispose?.()) } }
  } catch (error) {
    resources.forEach((r) => r.dispose?.())
    if (error instanceof PageExportError) throw error
    throw new PageExportError('EXPORT_MEDIA_FAILED', '이미지를 준비하지 못했어요. 원본을 확인한 뒤 다시 시도해 주세요.', error)
  }
}
