/** 사용자 클릭의 첫 await 전에 picker를 열어 user activation을 보존한다. */
export async function saveWebFile(result, fileName, { mimeType, extension, description }) {
  if (!result?.blob || result.blob.type !== mimeType || !result.blob.size) throw new Error('Export output unavailable')
  if (typeof window.showSaveFilePicker === 'function') {
    let handle
    try { handle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description, accept: { [mimeType]: [extension] } }] }) }
    catch (error) { if (error.name === 'AbortError') return { status: 'cancelled' }; throw error }
    const writable = await handle.createWritable()
    try { await writable.write(result.blob); await writable.close() }
    catch (error) { try { await writable.abort() } catch {} throw error }
    return { status: 'saved', fileName: handle.name || fileName }
  }
  const uri = URL.createObjectURL(result.blob), anchor = document.createElement('a')
  try { anchor.href = uri; anchor.download = fileName; document.body.appendChild(anchor); anchor.click() }
  finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(uri), 60000) }
  return { status: 'download-started', fileName }
}
