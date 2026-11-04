// AsyncStorage 와 같은 모양의 저장소. 다이어리 문서 키만 페이지별 파일로 보내고 나머지는 그대로 넘긴다.
// 삭제 · 사진 참조 검사 · 고아 복구처럼 "저장된 값 전체"를 훑는 코드가 파일로 옮긴 문서도 똑같이 보게 한다.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { STORAGE_KEYS } from '../utils/storageContract.js'
import { createDocumentStore } from './documentStore.js'
import { documentFiles } from './documentFiles'
import { readStoredDocument } from './readStoredDocument.js'

const MEMBER_DOC = /^dio:member:v1:\d+:doc:[^:]+$/
export function isDocumentKey(key) {
  if (typeof key !== 'string') return false
  if (MEMBER_DOC.test(key) || key === STORAGE_KEYS.doc) return true
  const prefix = `${STORAGE_KEYS.doc}:`
  return key.startsWith(prefix) && key.length > prefix.length && !key.slice(prefix.length).includes(':')
}

const parseDocument = (raw) => {
  const value = JSON.parse(raw)
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}
// 옮기기에서만 쓴다. 손상된 옛 행은 옮기지 않고 그대로 둔다.
const parseLegacyDocument = (raw) => {
  if (!raw) return null
  try { return parseDocument(raw) } catch { return null }
}

function sameShape(source, restored) {
  const pages = source?.pages
  if (!Array.isArray(pages)) return JSON.stringify(source) === JSON.stringify(restored)
  if (!Array.isArray(restored?.pages) || restored.pages.length !== pages.length) return false
  return pages.every((page, pageIndex) => {
    const other = restored.pages[pageIndex]
    const objects = page?.objects ?? []
    if (page?.id !== other?.id || objects.length !== (other?.objects ?? []).length) return false
    return objects.every((object, index) => object?.id === other.objects[index]?.id
      && (object?.points?.length ?? 0) === (other.objects[index]?.points?.length ?? 0))
  })
}

export function createDocumentStorage({ storage, files }) {
  if (!files) {
    return {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => storage.setItem(key, value),
      removeItem: (key) => storage.removeItem(key),
      getAllKeys: () => storage.getAllKeys(),
      multiGet: (keys) => storage.multiGet(keys),
      loadDocument: (key) => readStoredDocument(storage, key),
      saveDocument: (key, doc) => storage.setItem(key, JSON.stringify(doc)),
      loadSummary: async () => null,
      loadPagesAt: async () => null,
      loadOutline: async () => null,
      loadObjects: async () => [],
      migrateLegacyDocuments: async () => ({ migrated: 0, removed: 0, failed: 0 }),
    }
  }
  const store = createDocumentStore({ files })

  const getItem = async (key) => {
    if (!isDocumentKey(key)) return storage.getItem(key)
    const doc = await store.readDocument(key)
    return doc ? JSON.stringify(doc) : storage.getItem(key)
  }

  const setItem = async (key, value) => {
    if (!isDocumentKey(key)) return storage.setItem(key, value)
    let doc = null
    try { doc = parseDocument(value) } catch { doc = null }
    // 문서 모양이 아닌 값은 옮길 수 없으므로 원래 자리에 둔다.
    if (!doc) return storage.setItem(key, value)
    return store.writeDocument(key, doc)
  }

  const removeItem = async (key) => {
    if (isDocumentKey(key)) await store.removeDocument(key)
    return storage.removeItem(key)
  }

  return {
    getItem,
    setItem,
    removeItem,
    async getAllKeys() {
      const [legacy, moved] = await Promise.all([storage.getAllKeys(), store.listKeys()])
      return [...new Set([...legacy, ...moved])]
    },
    async multiGet(keys) {
      const others = keys.filter((key) => !isDocumentKey(key))
      const values = new Map(others.length ? await storage.multiGet(others) : [])
      // 읽기 실패는 그대로 던진다. 호출자는 실패하면 아무것도 지우지 않는다.
      for (const key of keys.filter(isDocumentKey)) values.set(key, await getItem(key))
      return keys.map((key) => [key, values.get(key) ?? null])
    },
    async loadDocument(key) {
      return (await store.readDocument(key)) ?? readStoredDocument(storage, key)
    },
    saveDocument: (key, doc) => store.writeDocument(key, doc),
    /** 파일로 옮긴 문서의 목차 요약. 옮기지 않은 문서는 null 이다(호출자가 전체를 읽는다). */
    loadSummary: (key) => store.readSummary(key),
    loadPagesAt: (key, indexes) => store.readPagesAt(key, indexes),
    loadOutline: (key) => store.readOutline(key),
    loadObjects: (key, ids) => store.readObjects(key, ids),
    /**
     * 앱을 켤 때 한 번. 옛 행을 파일로 옮기고 다시 읽어 확인한다. 옛 행은 다음 실행에서 지운다.
     * 읽지 못하는 행(약 4MB 초과)은 그대로 둔다.
     */
    async migrateLegacyDocuments() {
      const result = { migrated: 0, removed: 0, failed: 0 }
      const keys = (await storage.getAllKeys()).filter(isDocumentKey)
      for (const key of keys) {
        await store.exclusive(key, async () => {
          if (await store.readManifest(key)) {
            await storage.removeItem(key)
            result.removed += 1
            return
          }
          const doc = parseLegacyDocument(await storage.getItem(key))
          if (!doc) return
          try {
            await store.writeInQueue(key, doc)
            store.forget(key)
            if (!sameShape(doc, await store.readInQueue(key))) throw new Error('Migrated document differs')
            result.migrated += 1
          } catch (error) {
            // 확인에 실패한 사본을 지워 옛 행이 계속 쓰이게 한다.
            await store.removeInQueue(key)
            throw error
          }
        }).catch(() => { result.failed += 1 })
      }
      return result
    },
  }
}

const documentStorage = createDocumentStorage({ storage: AsyncStorage, files: documentFiles })
export default documentStorage
