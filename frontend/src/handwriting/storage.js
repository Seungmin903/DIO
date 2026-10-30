import AsyncStorage from '@react-native-async-storage/async-storage'
import { randomUUID } from 'expo-crypto'
import { validateDraft } from './protocol.js'
import { inspectTrueType, fromBase64, toBase64, decodeUtf8 } from './fontFormat.js'
import { pickLocalFile, readFontBytes, restoreFontUri, saveFontBytes, writeLocalPackage } from './files'

const DRAFT_KEY = 'dio-handwriting-draft-v1', FONTS_KEY = 'dio-personal-fonts-v1', JOB_KEY = 'dio-handwriting-job-v1'
let writes = Promise.resolve()
const enqueue = task => { const next = writes.catch(() => {}).then(task); writes = next; return next }
const read = async (key, fallback) => { const text = await AsyncStorage.getItem(key); return text == null ? fallback : JSON.parse(text) }
export function newDraft() { return { schema: 1, kind: 'dio-handwriting-draft', id: randomUUID(), samples: {}, updatedAt: new Date().toISOString() } }
export async function loadDraft() { return validateDraft(await read(DRAFT_KEY, newDraft())) }
export function saveDraft(draft) {
  validateDraft(draft)
  const snapshot = JSON.stringify(draft)
  return enqueue(() => AsyncStorage.setItem(DRAFT_KEY, snapshot))
}
export async function loadFontLibrary() {
  const fonts = await read(FONTS_KEY, [])
  if (!Array.isArray(fonts)) throw new Error('글꼴 목록을 읽을 수 없어요.')
  return Promise.all(fonts.map(async font => {
    try { return { ...font, uri: await restoreFontUri(font) } } catch { return { ...font, missing: true } }
  }))
}
export async function saveFontRecord(font) {
  return enqueue(async () => {
    const fonts = await read(FONTS_KEY, [])
    const previous = fonts.find(f => f.id === font.id)
    if (previous && previous.family !== font.family) throw new Error('글꼴 ID가 충돌했어요.')
    await AsyncStorage.setItem(FONTS_KEY, JSON.stringify([...fonts.filter(f => f.id !== font.id), font]))
    return font
  })
}
export async function registerFontFile(uri, label, sourceJob = null) {
  if (typeof label !== 'string' || !label.trim() || label.trim().length > 30) throw new Error('폰트 이름을 1~30자로 입력해 주세요.')
  const bytes = await readFontBytes(uri), validation = inspectTrueType(bytes), id = randomUUID()
  const saved = await saveFontBytes(id, bytes)
  return saveFontRecord({ id: `personal-${id}`, fileId: id, family: `DIOHW_${id.replaceAll('-', '')}`, label: label.trim(), uri: saved, sourceJob, validation, createdAt: new Date().toISOString() })
}
export async function importLocalFile() {
  const file = await pickLocalFile()
  if (!file) return null
  if (file.name.toLowerCase().endsWith('.ttf')) {
    inspectTrueType(file.bytes)
    const id = randomUUID(), uri = await saveFontBytes(id, file.bytes)
    const font = await saveFontRecord({ id: `personal-${id}`, fileId: id, family: `DIOHW_${id.replaceAll('-', '')}`, label: file.name.replace(/\.ttf$/i, '').slice(0, 30) || '가져온 글꼴', uri, validation: inspectTrueType(file.bytes), createdAt: new Date().toISOString() })
    return { kind: 'font', font }
  }
  const data = JSON.parse(decodeUtf8(file.bytes))
  if (data.kind === 'dio-handwriting-draft') { const draft = validateDraft(data); await saveDraft(draft); return { kind: 'draft', draft } }
  if (data.kind === 'dio-font' && data.schema === 1 && typeof data.label === 'string') {
    const bytes = fromBase64(data.ttf); inspectTrueType(bytes)
    const id = randomUUID(), uri = await saveFontBytes(id, bytes)
    const font = await saveFontRecord({ id: `personal-${id}`, fileId: id, family: `DIOHW_${id.replaceAll('-', '')}`, label: data.label.trim().slice(0, 30) || '가져온 글꼴', uri, validation: inspectTrueType(bytes), createdAt: new Date().toISOString() })
    return { kind: 'font', font }
  }
  throw new Error('DIO 손글씨 초안이나 완성 폰트 파일을 선택해 주세요.')
}
export async function exportDraft(draft) { validateDraft(draft); return writeLocalPackage('DIO-손글씨초안.json', JSON.stringify(draft)) }
export async function exportFont(font) { return writeLocalPackage(`DIO-${font.id}.json`, JSON.stringify({ kind: 'dio-font', schema: 1, label: font.label, ttf: toBase64(await readFontBytes(font.uri)) })) }
export async function loadLastJob() { return read(JOB_KEY, null) }
export async function saveLastJob(job) { return enqueue(() => AsyncStorage.setItem(JOB_KEY, JSON.stringify(job))) }
