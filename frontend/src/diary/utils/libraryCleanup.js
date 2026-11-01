// 나의 표지 · 나의 속지를 지우거나 다이어리를 영구 삭제할 때, 더 이상 아무도 쓰지 않는 쪽 그림(미디어 보관함)과 원본 PDF 를 함께 지운다.
// 같은 PDF 에서 만든 다이어리 · 나의 속지 · 나의 표지가 쪽 그림과 원본을 같이 쓰므로 참조를 세어 남은 곳이 없을 때만 지운다.

/**
 * target 이 쓰는 미디어 · 원본 PDF 중 raws(저장된 다른 값들의 원문) 어디에도 id 가 없는 것.
 * 값을 JSON 으로 해석하지 않고 id 글자가 나오는지만 본다 — 다이어리 목록의 표지 사진, 문서, 보관함, 꾸미기 소재 등 어디에 있든 "쓰는 중"으로 남기는 쪽이 안전하다.
 */
export function findUnshared({ target, raws, collectMediaIds, collectSourceIds }) {
  const used = id => raws.some(raw => typeof raw === 'string' && raw.includes(id))
  return {
    mediaIds: collectMediaIds(target).filter(id => !used(id)),
    sourceIds: collectSourceIds(target).filter(id => !used(id)),
  }
}

/** 저장된 모든 값을 참조로 본다. 다만 불러온 PDF 기록(pdfImports)은 모든 id 를 들고 있어서 뺀다. */
export const isReferenceKey = (key, keys) => key !== keys.pdfImports

/**
 * 보관함 항목(나의 표지 · 나의 속지 한 개)을 지운 뒤 호출한다. 항목은 이미 보관함 저장에서 빠져 있어야 한다.
 * 저장값을 읽다 실패하면 아무것도 지우지 않는다(참조를 "없음"으로 읽어 쓰는 파일을 지우지 않게).
 */
export async function cleanupRemovedEntry({ entry, storage, keys, collectMediaIds, collectSourceIds, removeMedia, removeSource }) {
  const none = { mediaIds: [], sourceIds: [] }
  if (!entry) return none
  let unshared
  try {
    const referenceKeys = (await storage.getAllKeys()).filter(key => isReferenceKey(key, keys))
    const records = referenceKeys.length ? await storage.multiGet(referenceKeys) : []
    unshared = findUnshared({ target: entry, raws: records.map(([, raw]) => raw), collectMediaIds, collectSourceIds })
  } catch { return none }
  await Promise.allSettled([...unshared.mediaIds.map(id => removeMedia(id)), ...unshared.sourceIds.map(id => removeSource(id))])
  return unshared
}
