// 휴지통 선택 모드의 순수 계산. 화면(TrashScreen)에서 분리해 테스트한다.
// selected 는 null(선택 모드 아님) 또는 고른 id 배열이다.

const DAY = 24 * 60 * 60 * 1000;
export const URGENT_DAYS = 3;

/** 기한(밀리초)이 3일 이하로 남았거나 이미 지났는지. 기한을 모르면(null · NaN) 긴급으로 보지 않는다. */
export function isTrashUrgent(deadline, now) {
  return Number.isFinite(deadline) && deadline - now <= URGENT_DAYS * DAY;
}

/** 목록에서 사라진 id 를 선택에서 뺀다. 바뀐 게 없으면 같은 배열을 돌려줘 불필요한 다시 그리기를 막는다. */
export function pruneSelection(selected, ids) {
  if (selected === null) return selected;
  const next = selected.filter(id => ids.has(id));
  return next.length === selected.length ? selected : next;
}

/** 선택을 켜고 끈다. 선택 모드가 아니면 그대로 둔다. */
export function toggleSelection(selected, id) {
  if (selected === null) return selected;
  return selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id];
}

/** 고른 항목 중 복원할 수 있는 것 · 영구 삭제할 수 있는 것으로 나눈다. rows: [{ diary, canRestore, canDelete }] */
export function splitSelection(rows, selected) {
  const picked = (selected ?? []).map(id => rows.find(row => row.diary.id === id)).filter(Boolean);
  return { picked, restorable: picked.filter(row => row.canRestore), deletable: picked.filter(row => row.canDelete) };
}

/** 전체 선택 대상(복원 또는 삭제가 가능한 항목)의 id 와 모두 골랐는지. */
export function selectableIds(rows) {
  return rows.filter(row => row.canRestore || row.canDelete).map(row => row.diary.id);
}

export function isAllSelected(rows, selected) {
  const ids = selectableIds(rows);
  return ids.length > 0 && ids.every(id => (selected ?? []).includes(id));
}
