/** Expo 웹 picker는 반환 전에 Image로 디코딩하므로 브라우저가 HEIC를 지원하지 않으면 실패한다. */
export function selectImages({ multiple }) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif'
    input.multiple = multiple
    input.style.display = 'none'
    let settled = false
    let timer
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('focus', onFocus); input.remove() }
    const finish = (result) => { if (settled) return; settled = true; cleanup(); resolve(result) }
    const onFocus = () => {
      // cancel 이벤트가 없는 브라우저의 취소 복귀도 처리한다.
      timer = setTimeout(() => { if (!input.files?.length) finish({ canceled: true, assets: [] }) }, 500)
    }
    input.onchange = () => {
      const assets = Array.from(input.files ?? []).map((file) => ({ file, fileName: file.name, fileSize: file.size }))
      finish({ canceled: assets.length === 0, assets })
    }
    input.oncancel = () => finish({ canceled: true, assets: [] })
    window.addEventListener('focus', onFocus)
    document.body.appendChild(input)
    try { input.click() } catch (error) { settled = true; cleanup(); reject(error) }
  })
}
