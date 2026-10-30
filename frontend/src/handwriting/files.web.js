let database
function db() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('dio-personal-fonts', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('fonts')
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
  })
  return database
}
async function stored(id, bytes) {
  const database = await db()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('fonts', bytes ? 'readwrite' : 'readonly'), store = tx.objectStore('fonts')
    const request = bytes ? store.put(bytes, id) : store.get(id)
    let result
    request.onsuccess = () => { result = request.result }
    tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error)
  })
}
export function pickLocalFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,.ttf'; input.style.display = 'none'; document.body.appendChild(input)
    input.oncancel = () => { input.remove(); resolve(null) }
    input.onchange = async () => {
      const file = input.files?.[0]; input.remove()
      if (!file) return resolve(null)
      try { if (file.size > 90 * 1024 * 1024) throw new Error('파일이 너무 커요.'); resolve({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }) } catch (error) { reject(error) }
    }
    input.click()
  })
}
export async function writeLocalPackage(name, text) {
  const uri = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a')
  a.href = uri; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(uri), 30000); return true
}
export async function saveFontBytes(id, bytes) {
  if (await stored(id)) throw new Error('폰트 파일 ID가 충돌했어요.')
  await stored(id, bytes); return URL.createObjectURL(new Blob([bytes], { type: 'font/ttf' }))
}
export async function removeFontBytes(id) {
  const database = await db()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('fonts', 'readwrite'); tx.objectStore('fonts').delete(id)
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error)
  })
}
export async function restoreFontUri(font) {
  const bytes = await stored(font.fileId ?? font.id)
  if (!bytes) throw new Error('기기에 저장된 폰트를 찾지 못했어요.')
  return URL.createObjectURL(new Blob([bytes], { type: 'font/ttf' }))
}
export async function readFontBytes(uri) { return new Uint8Array(await (await fetch(uri)).arrayBuffer()) }
