// 공유 화면과 같은 수신 목록에서 표시 정보만 가져온다.
// 알림 ID·읽음·초대 상태는 알림 API의 값을 유지한다.
export const MAX_INVITATION_DESCRIPTION_PAGES = 3;

export async function describeSharingInvitations(api, inviteIds, { signal } = {}) {
  const remaining = new Set(inviteIds.map(String)), result = new Map(), cursors = new Set();
  if (!remaining.size) return result;
  let cursor, pages = 0;
  do {
    if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    const page = await api.list({ cursor, signal });
    pages++;
    for (const row of page.items) {
      const id = String(row.inviteId);
      if (!remaining.has(id)) continue;
      result.set(id, { title: row.title, actor: row.actor, diary: row.diary });
      remaining.delete(id);
    }
    cursor = page.nextCursor;
    if (cursor == null || cursors.has(cursor)) break;
    cursors.add(cursor);
  } while (remaining.size && pages < MAX_INVITATION_DESCRIPTION_PAGES);
  return result;
}
