// 필기 모드에서만 설치한다. Safari가 캔버스 밖에 만든 선택도 정리하되 실제 글상자는 제외한다.
export function installDrawingSelectionGuard(node) {
  if (!node?.addEventListener) return () => {}
  const doc = node.ownerDocument
  // iPad Safari는 빈 그림 영역에서 시작해 주변 UI 텍스트를 선택하기도 한다.
  // 선택을 사후 해제하는 것만으로는 네이티브 선택 제스처가 계속 진행된다.
  const sheet = doc?.createElement?.('style')
  if (sheet && doc.head) {
    sheet.setAttribute('data-dio-drawing-selection', '')
    sheet.textContent = `body,body *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}
body input,body textarea,body [contenteditable]:not([contenteditable="false"]),body [contenteditable]:not([contenteditable="false"]) *{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default!important}`
    doc.head.appendChild(sheet)
  }
  const editable = node => {
    const element = node?.nodeType === 3 ? node.parentElement : node
    return Boolean(element?.closest?.('input,textarea,[contenteditable]:not([contenteditable="false"])'))
  }
  const prevent = event => {
    if (editable(event.target)) return
    if (event.cancelable && !event.defaultPrevented) event.preventDefault()
  }
  const clearLateSelection = () => {
    const selection = doc?.getSelection?.()
    if (!selection || selection.isCollapsed) return
    if (editable(doc.activeElement) || editable(selection.anchorNode) || editable(selection.focusNode)) return
    selection.removeAllRanges()
  }
  const names = ['selectstart', 'contextmenu', 'dragstart']
  for (const name of names) node.addEventListener(name, prevent)
  doc?.addEventListener('selectstart', prevent, true)
  doc?.addEventListener('selectionchange', clearLateSelection)
  return () => {
    sheet?.remove()
    for (const name of names) node.removeEventListener(name, prevent)
    doc?.removeEventListener('selectstart', prevent, true)
    doc?.removeEventListener('selectionchange', clearLateSelection)
  }
}
