export async function obtainLicenseSource(source) {
  const url = new URL(source.url, document.baseURI)
  if (url.origin !== location.origin) throw new Error('소스 파일은 이 사이트에서만 받을 수 있어요.')
  const anchor = document.createElement('a')
  anchor.href = url.href; anchor.download = source.fileName
  document.body.appendChild(anchor); anchor.click(); anchor.remove()
}
