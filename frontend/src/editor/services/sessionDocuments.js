// 임시 화면 검증 문서. 개인 다이어리 저장 키/기기 저장소와 분리한다.
const records = new Map();
let sessionSequence = 0;
export const isSessionDocumentKey = (key) =>
  typeof key === 'string' && key.startsWith('session-doc:');
export const readSessionDocument = (key) => records.get(key)?.doc ?? null;
export const readSessionPage = (key) => records.get(key)?.pageId ?? null;
export function writeSessionPage(key, pageId) {
  const record = records.get(key);
  if (!record) return false;
  record.pageId = pageId;
  return true;
}
export function writeSessionDocument(key, doc) {
  const record = records.get(key);
  if (!record) return false;
  record.doc = doc;
  return true;
}
export function forgetSessionDocument(key) {
  records.delete(key);
}
export function createSessionDocuments() {
  const session = ++sessionSequence;
  const keys = new Map();
  let active = true,
    sequence = 0;
  return {
    key(id) {
      if (!active) return null;
      if (!keys.has(id)) {
        const key = `session-doc:${session}:${++sequence}:${id}`;
        keys.set(id, key);
        records.set(key, { doc: null });
      }
      return keys.get(id);
    },
    release(id) {
      records.delete(keys.get(id));
      keys.delete(id);
    },
    activate() {
      active = true;
    },
    dispose() {
      active = false;
      for (const key of keys.values()) records.delete(key);
      keys.clear();
    },
  };
}
