export function canLeaveForInvitation({ loaded, saveStatus, editing }) {
  return loaded && saveStatus === 'saved' && !editing;
}

export function openCopyIfSafe(diary, guard, close, open) {
  if (guard && !guard()) return false;
  close();
  open(diary);
  return true;
}
