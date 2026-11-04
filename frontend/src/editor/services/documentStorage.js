// AsyncStorage 와 같은 모양의 저장소. 다이어리 문서 키만 페이지별 파일로 보내고 나머지는 그대로 넘긴다.
// 삭제 · 사진 참조 검사 · 고아 복구처럼 "저장된 값 전체"를 훑는 코드가 파일로 옮긴 문서도 똑같이 보게 한다.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { STORAGE_KEYS } from '../utils/storageContract.js'
import { createDocumentStore } from './documentStore.js'
import { documentFiles } from './documentFiles'
import { readStoredDocument } from './readStoredDocument.js'
import { samePoints } from '../utils/strokeCodec.js'

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

function sameValue(a, b) {
  if (a === b) return true
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((item, index) => sameValue(item, b[index]))
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(b)) return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => key in b && sameValue(a[key], b[key]))
}

// 필기 점만 저장 눈금의 오차를 허용하고 나머지는 값까지 같아야 한다.
function sameObject(source, restored) {
  if (source?.type !== 'stroke' || !Array.isArray(source.points) || !Array.isArray(restored?.points)) return sameValue(source, restored)
  const { points, ...rest } = source
  const { points: restoredPoints, ...restoredRest } = restored
  return samePoints(points, restoredPoints) && sameValue(rest, restoredRest)
}

/** 옛 행을 지워도 되는지 판단한다. 옮긴 사본이 원본과 값까지 같아야 한다. */
export function sameDocument(source, restored) {
  const pages = source?.pages
  if (!Array.isArray(pages)) return sameValue(source, restored)
  const { pages: restoredPages, ...restoredRest } = restored ?? {}
  const { pages: _, ...rest } = source
  if (!sameValue(rest, restoredRest) || !Array.isArray(restoredPages) || restoredPages.length !== pages.length) return false
  return pages.every((page, pageIndex) => {
    const { objects, ...shell } = page ?? {}
    const { objects: restoredObjects, ...restoredShell } = restoredPages[pageIndex] ?? {}
    if (!sameValue(shell, restoredShell)) return false
    if (!Array.isArray(objects)) return sameValue(objects, restoredObjects)
    return Array.isArray(restoredObjects) && objects.length === restoredObjects.length
      && objects.every((object, index) => sameObject(object, restoredObjects[index]))
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
      async scanText(keys, visit) {
        for (const key of keys) if (visit(key, await storage.getItem(key)) === false) return
      },
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
    /**
     * 참조 검사용. 값을 하나씩 visit(key, 원문) 에 넘기고 놓는다. false 를 돌려주면 멈춘다.
     * 파일로 옮긴 문서는 목차와 페이지 파일을 따로 넘기므로 원문 하나가 문서 전체가 아니다. 읽기 실패는 그대로 던진다.
     */
    async scanText(keys, visit) {
      for (const key of keys) {
        let stopped = false
        const inFiles = isDocumentKey(key) && await store.scanDocument(key, (raw) => {
          stopped = visit(key, raw) === false
          return !stopped
        })
        if (stopped) return
        if (!inFiles && visit(key, await storage.getItem(key)) === false) return
      }
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
     * 앱을 켤 때 한 번. 옛 행을 파일로 옮기고 다시 읽어 확인한다. 옛 행은 다음 실행에서 파일을 다시 읽어 본 뒤 지운다.
     * 읽지 못하는 행(약 4MB 초과)은 그대로 둔다.
     */
    async migrateLegacyDocuments() {
      const result = { migrated: 0, removed: 0, failed: 0 }
      const keys = (await storage.getAllKeys()).filter(isDocumentKey)
      for (const key of keys) {
        await store.exclusive(key, async () => {
          if (await store.readManifest(key)) {
            // 옛 행은 마지막 사본이다. 파일 쪽을 끝까지 읽을 수 있을 때만 지운다. 읽기에 실패하면 행을 남긴다.
            await store.readInQueue(key)
            await storage.removeItem(key)
            result.removed += 1
            return
          }
          const doc = parseLegacyDocument(await storage.getItem(key))
          if (!doc) return
          try {
            await store.writeInQueue(key, doc)
            store.forget(key)
            if (!sameDocument(doc, await store.readInQueue(key))) throw new Error('Migrated document differs')
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
