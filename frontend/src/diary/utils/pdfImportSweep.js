// 불러온 PDF 의 쪽 그림 · 원본 중 어디에도 담기지 않고 남은 것(고아 파일)을 찾는 계산. 저장소 읽기 · 쓰기는 pdfImportRegistry 가 한다.
// 불러올 때마다 { sourceId, mediaFileIds, createdAt } 를 기록해 두고, 앱을 켠 뒤 한 번 살펴 저장된 값 어디에도 id 가 없는 것만 지운다.

// 막 불러온 것은 아직 화면에서 저장 중일 수 있어 이 시간이 지난 기록만 살핀다.
export const SWEEP_GRACE_MS = 24 * 60 * 60 * 1000

const idsOf = value => (Array.isArray(value) ? value.filter(id => typeof id === 'string' && id) : [])

/** 저장된 기록 → 쓸 수 있는 목록. 잘못된 항목은 버린다. */
export function normalizeImportGroups(raw) {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const sourceId = typeof item.sourceId === 'string' && item.sourceId ? item.sourceId : null
    const mediaFileIds = idsOf(item.mediaFileIds)
    if (!sourceId && !mediaFileIds.length) return []
    const time = Date.parse(item.createdAt)
    return [{ sourceId, mediaFileIds, createdAt: Number.isFinite(time) ? new Date(time).toISOString() : new Date(0).toISOString() }]
  })
}

export function addImportGroup(groups, { sourceId, mediaFileIds }, now = Date.now()) {
  return [...normalizeImportGroups(groups).filter(item => item.sourceId !== sourceId), { sourceId, mediaFileIds: idsOf(mediaFileIds), createdAt: new Date(now).toISOString() }]
}

export const removeImportGroup = (groups, sourceId) => normalizeImportGroups(groups).filter(item => item.sourceId !== sourceId)

/**
 * 어디에도 id 가 없는 쪽 그림 · 원본을 고른다.
 * - raws: 이 기록 말고 저장된 모든 값의 원문. id 글자가 한 번이라도 나오면 쓰는 것으로 본다(읽을 수 없는 값은 "쓰는 중"으로 남기는 쪽이 안전해서 JSON 으로 해석하지 않는다).
 * - isUsed: raws 대신 쓰는 판정. 저장값을 한 조각씩 훑은 결과를 넘긴다.
 * 반환: { mediaIds, sourceIds, remaining(남길 기록) }
 */
export function sweepGroups({ groups, raws, isUsed, now = Date.now(), graceMs = SWEEP_GRACE_MS }) {
  const used = isUsed ?? (id => raws.some(raw => typeof raw === 'string' && raw.includes(id)))
  const mediaIds = [], sourceIds = [], remaining = []
  for (const group of normalizeImportGroups(groups)) {
    if (now - Date.parse(group.createdAt) < graceMs) { remaining.push(group); continue }
    const keptMedia = group.mediaFileIds.filter(id => used(id))
    mediaIds.push(...group.mediaFileIds.filter(id => !keptMedia.includes(id)))
    const keepSource = group.sourceId && used(group.sourceId)
    if (group.sourceId && !keepSource) sourceIds.push(group.sourceId)
    // 아직 쓰는 것만 기록에 남긴다. 다 지웠으면 기록도 지운다.
    if (keepSource || keptMedia.length) remaining.push({ ...group, sourceId: keepSource ? group.sourceId : null, mediaFileIds: keptMedia })
  }
  return { mediaIds, sourceIds, remaining }
}
