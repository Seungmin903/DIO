/** 사용자 클릭에서 호출해야 저장 대화상자의 user activation을 유지한다. */
export async function savePngFile(result, fileName) {
  if (!result?.blob || result.blob.type !== 'image/png' || !result.blob.size) throw new Error('PNG output unavailable')
  if (typeof window.showSaveFilePicker === 'function') {
    let handle
    try {
      handle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'PNG 이미지', accept: { 'image/png': ['.png'] } }] })
    } catch (error) {
      if (error.name === 'AbortError') return { status: 'cancelled' }
      throw error
    }
    const writable = await handle.createWritable()
    try { await writable.write(result.blob); await writable.close() }
    catch (error) { try { await writable.abort() } catch {} throw error }
    return { status: 'saved', fileName: handle.name || fileName }
  }
  // 브라우저 다운로드는 실제 디스크 저장/취소 여부를 알려주지 않는다.
  const uri = URL.createObjectURL(result.blob)
  const anchor = document.createElement('a')
  try {
    anchor.href = uri; anchor.download = fileName
    document.body.appendChild(anchor); anchor.click()
  } finally {
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(uri), 60000)
  }
  return { status: 'download-started', fileName }
}
