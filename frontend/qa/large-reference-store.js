// QA comparison snapshots stay on-device in an isolated DB. They must not take
// up the production AsyncStorage/localStorage budget or enter the media DB.
export function largeReference(mode, key, value) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dio-large-qa-reference-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('references')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction('references', mode === 'read' ? 'readonly' : 'readwrite')
      const store = transaction.objectStore('references')
      const operation = mode === 'read' ? store.get(key) : store.put(value, key)
      transaction.oncomplete = () => { const result = operation.result; db.close(); resolve(result) }
      transaction.onerror = () => { const error = transaction.error; db.close(); reject(error) }
      transaction.onabort = () => { db.close(); reject(transaction.error ?? Error('QA 기준 저장 취소')) }
    }
  })
}
