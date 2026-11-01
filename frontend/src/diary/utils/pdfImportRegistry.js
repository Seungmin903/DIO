import AsyncStorage from '@react-native-async-storage/async-storage'
import { STORAGE_KEYS } from '../../editor/services/storage'
import * as mediaRepository from '../../editor/utils/mediaRepository'
import { addImportGroup, normalizeImportGroups, removeImportGroup, sweepGroups } from './pdfImportSweep.js'
import { removePdfSource } from './pdfSourceStore'

// 불러온 PDF 기록(어떤 쪽 그림과 원본을 만들었는지)을 기기에 남기고, 앱을 켠 뒤 안 쓰는 것을 정리한다. 읽고 쓰는 일은 한 줄로 처리한다.
const KEY = STORAGE_KEYS.pdfImports
let queue = Promise.resolve()
const enqueue = task => { const run = queue.then(task); queue = run.catch(() => {}); return run }

const read = async () => { try { return normalizeImportGroups(JSON.parse(await AsyncStorage.getItem(KEY) ?? '[]')) } catch { return [] } }
const write = groups => AsyncStorage.setItem(KEY, JSON.stringify(groups))

/** PDF 를 불러온 직후 기록한다. 실패해도 불러오기는 그대로 성공이다(그 PDF 만 고아 점검에서 빠진다). */
export const registerPdfImport = ({ sourceId, mediaFileIds }) => enqueue(async () => { await write(addImportGroup(await read(), { sourceId, mediaFileIds })) }).catch(() => {})

/** 저장하지 않고 되돌린 불러오기는 기록에서도 뺀다. */
export const forgetPdfImport = sourceId => enqueue(async () => { await write(removeImportGroup(await read(), sourceId)) }).catch(() => {})

let swept = false
/** 앱을 켠 뒤 한 번: 다이어리 · 보관함 · 표지 등 저장된 어디에도 없는 쪽 그림과 원본 PDF 를 지운다. 읽다 실패하면 아무것도 지우지 않는다. */
export function sweepPdfImports({ now = Date.now() } = {}) {
  if (swept) return Promise.resolve(null)
  swept = true
  return enqueue(async () => {
    const groups = await read()
    if (!groups.length) return null
    const keys = (await AsyncStorage.getAllKeys()).filter(key => key !== KEY)
    const raws = keys.length ? (await AsyncStorage.multiGet(keys)).map(([, raw]) => raw) : []
    const { mediaIds, sourceIds, remaining } = sweepGroups({ groups, raws, now })
    await Promise.allSettled([...mediaIds.map(id => mediaRepository.remove(id)), ...sourceIds.map(id => removePdfSource(id))])
    await write(remaining)
    return { mediaIds, sourceIds }
  }).catch(() => null)
}
