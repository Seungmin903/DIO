// 여러 권을 휴지통으로 옮긴 결과를 알약 토스트 한 줄로 만든다(지라 619). 목록 위 칸에는 다시 로그인해야 하는 실패만 남긴다.
export const BULK_TRASH_DONE_MS = 2000

export const bulkTrashNeedsLogin = bulk => Boolean(bulk?.failed?.some(item => item.error?.status === 401))

/** 토스트 문구. 보여 줄 것이 없거나(결과 없음 · 다시 로그인 필요) 하면 null. */
export function bulkTrashToastMessage(bulk) {
  if (!bulk || bulkTrashNeedsLogin(bulk)) return null
  const moved = bulk.succeeded?.length ?? 0, failed = bulk.failed ?? []
  if (bulk.busy) return `휴지통으로 옮기고 있어요. ${moved}/${bulk.ids?.length ?? moved}권`
  if (failed.length) {
    // 표지 자료가 손상된 것만 실패했으면 그 이유를 한 번만 보인다. 다른 실패가 섞이면 권 수만 알린다.
    const reasons = [...new Set(failed.filter(item => item.error?.code === 'INVALID_LOCAL_CACHE').map(item => item.error.message).filter(Boolean))]
    const onlyCache = failed.every(item => item.error?.code === 'INVALID_LOCAL_CACHE')
    const head = moved ? `${moved}권을 옮겼고 ${failed.length}권은 옮기지 못했어요.` : `${failed.length}권을 휴지통으로 옮기지 못했어요.`
    return onlyCache && reasons.length === 1 ? `${head} ${reasons[0]}` : head
  }
  if (bulk.refreshError) return '휴지통으로 옮겼지만 목록을 새로 불러오지 못했어요.'
  return `${moved}권을 휴지통으로 옮겼어요.`
}
