export function canLeaveForInvitation({ loaded, saveStatus, editing }) {
  return loaded && saveStatus === 'saved' && !editing;
}
