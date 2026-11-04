/** 문서가 없는 경우와 읽을 수 없는 경우를 구별한다. 원본과 첫 손상 백업을 보존한다. */
export async function readStoredDocument(storage, key) {
  const raw = await storage.getItem(key)
  if (raw === null) return null
  try {
    const doc = JSON.parse(raw)
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.pages) || !doc.pages.length || doc.pages.some(page => !page || typeof page !== 'object' || !Array.isArray(page.objects))) throw new Error('INVALID_DOCUMENT')
    return doc
  } catch {
    const backupKey = `${key}:corrupt`
    try { if (await storage.getItem(backupKey) === null) await storage.setItem(backupKey, raw) } catch {}
    throw Object.assign(new Error('저장된 기록을 읽지 못했어요. 기존 기록은 유지했어요.'), { code: 'EDITOR_DOCUMENT_CORRUPT' })
  }
}
