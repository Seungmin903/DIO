// 불러온 PDF 원본을 IndexedDB 에 둔다(이미지 보관소와 따로). 확대하면 여기서 보이는 영역만 다시 그린다(pdfRegion).
const NAME = 'dio-pdf-source'
let opening
function openDb() {
  if (!opening) opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('PDF 원본을 저장할 수 없는 브라우저예요.'))
    const request = indexedDB.open(NAME, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('files')) request.result.createObjectStore('files') }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); opening = null }
      resolve(db)
    }
  }).catch(error => { opening = null; throw error })
  return opening
}

async function run(mode, work) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', mode)
    let result
    tx.oncomplete = () => resolve(result)
    tx.onabort = () => reject(tx.error ?? new Error('PDF transaction aborted'))
    try { result = work(tx.objectStore('files')) } catch (error) { tx.abort(); reject(error) }
  })
}

/** 고른 PDF(File · Blob)를 보관한다. id 는 pdfSource.sourceId. */
export async function savePdfSource(id, blob) {
  await run('readwrite', store => store.put(blob, id))
}

/** 서버에서 내려받은 PDF 바이트를 보관한다(공유 다이어리의 친구 쪽). */
export async function savePdfSourceBytes(id, bytes) {
  await savePdfSource(id, new Blob([bytes], { type: 'application/pdf' }))
}

/** 보관한 PDF Blob. 없으면 null. */
export async function readPdfSource(id) {
  const request = await run('readonly', store => store.get(id))
  return request.result ?? null
}

export async function removePdfSource(id) {
  if (!id) return
  try { await run('readwrite', store => store.delete(id)) } catch { /* 다음 실행에 남을 뿐이다. */ }
}
