// 보관함 관리 모드의 선택 목록. 화면 상태라 저장하지 않는다.

export function toggleSelection(ids, id) {
  return ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id];
}

/** 필터를 바꾸거나 다른 곳에서 휴지통으로 옮겨 지금 보이지 않는 다이어리는 선택에서 뺀다. */
export function visibleSelection(ids, diaries) {
  const shown = new Set(diaries.map(diary => diary.id));
  return ids.filter(id => shown.has(id));
}
