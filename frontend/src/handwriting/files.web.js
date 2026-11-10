let workflowDatabase
function workflowDb() {
  if (!workflowDatabase) workflowDatabase = new Promise((resolve, reject) => {
    const request = indexedDB.open('dio-handwriting-workflow', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('records')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { workflowDatabase = null; reject(request.error) }
  })
  return workflowDatabase
}
async function workflowTransaction(mode, action) {
  const database = await workflowDb()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('records', mode)
    let result
    const request = action(tx.objectStore('records'))
    request.onsuccess = () => { result = request.result }
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error)
  })
}
export const workflowBlobs = {
  withLock: task => navigator.locks ? navigator.locks.request('dio-handwriting-workflow', task) : task(),
  async read(ref) {
    const text = await workflowTransaction('readonly', store => store.get(ref))
    if (typeof text !== 'string') throw new Error('저장된 폰트 입력을 찾지 못했어요. 기존 데이터는 보존되어 있어요.')
    return text
  },
  write: (ref, text) => workflowTransaction('readwrite', store => store.add(text, ref)),
  remove: ref => workflowTransaction('readwrite', store => store.delete(ref)),
  async prune(keep) {
    const keys = await workflowTransaction('readonly', store => store.getAllKeys())
    for (const key of keys) if (!keep.has(key)) await workflowTransaction('readwrite', store => store.delete(key))
  },
}
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
// 공유 다이어리 폰트: 올릴 때 파일 이름에 기기 폰트 id 를 담는다(collaboration/diaryFonts.js)
export async function sharedFontUploadBody(font) {
  if (!font.uri) throw Object.assign(new Error('기기에 저장한 폰트를 찾지 못했어요.'), { code: 'FONT_SOURCE_MISSING' })
  const body = new FormData()
  body.append('file', new Blob([await readFontBytes(font.uri)], { type: 'font/ttf' }), `dio-hw-${font.fileId.toLowerCase()}.ttf`)
  body.append('libraryCategory', 'FONT')
  return body
}
// 웹은 받은 폰트를 편집 세션 동안만 기억한다(세션을 닫으면 object URL 을 풀고, 다시 열면 서버에서 다시 받는다)
const sharedFontCache = new Map() // mediaFileId → object URL
export async function cachedSharedFontUri(mediaFileId) { return sharedFontCache.get(mediaFileId) ?? null }
export async function saveSharedFontBytes(mediaFileId, bytes) {
  const uri = URL.createObjectURL(new Blob([bytes], { type: 'font/ttf' }))
  const previous = sharedFontCache.get(mediaFileId)
  if (previous) URL.revokeObjectURL(previous)
  sharedFontCache.set(mediaFileId, uri)
  return uri
}
export async function removeSharedFontBytes(mediaFileId) {
  const uri = sharedFontCache.get(mediaFileId)
  if (uri) URL.revokeObjectURL(uri)
  sharedFontCache.delete(mediaFileId)
}
export function releaseSharedFontUris() {
  for (const uri of sharedFontCache.values()) URL.revokeObjectURL(uri)
  sharedFontCache.clear()
}
export async function clearSharedFontBytes() { releaseSharedFontUris() }
