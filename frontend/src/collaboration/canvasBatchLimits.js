export const MAX_CANVAS_BATCH_ITEMS = 100
export const MAX_CANVAS_EXPECTED_VERSIONS = 200
const fields = ['creates', 'updates', 'deleteElementIds', 'restoreElementIds']
export function assertCanvasBatchLimits(changes, expectedVersions) {
  assertCanvasBatchCounts(Object.fromEntries(fields.map(field=>[field,changes?.[field]?.length??0])),Object.keys(expectedVersions??{}).length)
}
export function assertCanvasBatchCounts(counts, expectedVersionsCount = 0) {
  if (fields.some(field => (counts[field] ?? 0) > MAX_CANVAS_BATCH_ITEMS)
    || expectedVersionsCount > MAX_CANVAS_EXPECTED_VERSIONS) {
    // No HTTP status: a local guard must not enter the permanent server-rejection
    // path that removes an entry from the durable queue.
    throw Object.assign(Error('한 번에 생성·수정·삭제·복구하는 요소는 종류별 100개까지예요. 선택 수를 줄여 다시 시도해 주세요.'), { code: 'CANVAS_BATCH_LIMIT' })
  }
}
