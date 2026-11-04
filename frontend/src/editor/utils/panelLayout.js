// 폰 배치는 기존 폼팩터를 유지한다. 태블릿은 창 폭과 방향으로 패널 수를 정한다.
export function editorPanelLayout(width, compact, landscape) {
  if (compact) return { initialOpen: false, singlePanel: true }
  const singlePanel = width < 840 || !landscape
  return { initialOpen: !singlePanel, singlePanel }
}
