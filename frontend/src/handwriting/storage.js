import AsyncStorage from '@react-native-async-storage/async-storage'
import { randomUUID } from 'expo-crypto'
import { validateDraft } from './protocol.js'
import { inspectTrueType, fromBase64, toBase64, decodeUtf8 } from './fontFormat.js'
import { pickLocalFile, readFontBytes, restoreFontUri, saveFontBytes, removeFontBytes, writeLocalPackage } from './files'
import { correctFontSpacing, fontSpacingInfo, FONT_SPACING_VERSION } from './fontSpacing.js'

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
async function persistFont(bytes, label, details = {}, id = randomUUID()) {
  if (typeof label !== 'string' || !label.trim() || label.trim().length > 30) throw new Error('폰트 이름을 1~30자로 입력해 주세요.')
  const validation = inspectTrueType(bytes)
  const saved = await saveFontBytes(id, bytes)
  try {
    return await saveFontRecord({ ...details, ...fontSpacingInfo(bytes), id: `personal-${id}`, fileId: id, family: `DIOHW_${id.replaceAll('-', '')}`, label: label.trim(), uri: saved, validation, createdAt: new Date().toISOString() })
  } catch (error) { await removeFontBytes(id).catch(() => {}); throw error }
}
const registrations = new Map()
export async function registerFontFile(uri, label, sourceJob = null) {
  if (!sourceJob) return persistFont(await readFontBytes(uri), label)
  if (registrations.has(sourceJob)) return registrations.get(sourceJob)
  const task = (async () => {
    const existing = (await loadFontLibrary()).find(font => font.sourceJob === sourceJob)
    if (existing) return existing
    return persistFont(await readFontBytes(uri), label, { sourceJob })
  })().finally(() => registrations.delete(sourceJob))
  registrations.set(sourceJob, task)
  return task
}

export function renameFont(id, label) {
  if (!label.trim() || label.trim().length > 30) throw new Error('폰트 이름을 1~30자로 입력해 주세요.')
  return enqueue(async () => {
    const fonts = await read(FONTS_KEY, [])
    if (!fonts.some(font => font.id === id)) throw new Error('폰트를 찾지 못했어요.')
    await AsyncStorage.setItem(FONTS_KEY, JSON.stringify(fonts.map(font => font.id === id ? { ...font, label: label.trim() } : font)))
  })
}

const WORKFLOW_KEY = 'dio-handwriting-workflow-v2'
export function saveWorkflow(entries) {
  const snapshot = JSON.stringify({ schema: 2, entries })
  return enqueue(() => AsyncStorage.setItem(WORKFLOW_KEY, snapshot))
}
export async function loadWorkflow(current) {
  const saved = await read(WORKFLOW_KEY, null)
  if (saved && (saved.schema !== 2 || !Array.isArray(saved.entries))) throw new Error('폰트 작업 목록을 읽을 수 없어요. 기존 데이터는 보존되어 있어요.')
  const entries = current ? JSON.parse(JSON.stringify(current)) : saved?.entries || []
  const fonts = await loadFontLibrary()
  for (const font of fonts) {
    const existing = entries.find(e => e.fontId === font.id)
    if (existing && existing.name !== font.label) {
      existing.name = font.label
      if (!existing.sourceId) existing.baseName = font.label
    }
    if (!entries.some(e => e.fontId === font.id || (font.sourceJob && e.jobId === font.sourceJob))) entries.push({
      id: `imported-${font.id}`, name: font.label, baseName: font.label, status: 'ready', fontId: font.id,
      jobId: font.sourceJob || null, draft: null, createdAt: Date.parse(font.createdAt) || Date.now(),
    })
  }
  if (!saved) {
    const draft = await loadDraft(), job = await loadLastJob()
    if (Object.keys(draft.samples).length) entries.push({ id: `draft-${draft.id}`, name: '나의 손글씨', status: 'draft', draft, createdAt: Date.now() })
    if (job && !entries.some(e => e.jobId === job.id)) entries.push({ id: `legacy-${job.id}`, name: '이전 생성 폰트', status: job.state, jobId: job.id, job, draft: null, createdAt: Date.now() })
    await saveWorkflow(entries)
  }
  return entries
}
const spacingTasks = new Map()
export function correctRegisteredFont(font, onProgress) {
  if (spacingTasks.has(font.id)) return spacingTasks.get(font.id)
  const task = (async () => {
    const fonts = await read(FONTS_KEY, []), source = fonts.find(f => f.id === font.id)
    if (!source) throw new Error('보정할 폰트를 찾지 못했어요.')
    if (source.spacingVersion === FONT_SPACING_VERSION) throw new Error('이미 글자 간격이 보정된 폰트예요.')
    const existing = fonts.find(f => f.sourceFontId === source.id && f.spacingVersion === FONT_SPACING_VERSION)
    if (existing) {
      try { return { ...existing, uri: await restoreFontUri(existing) } } catch { /* A missing copy may be rebuilt without deleting its document references. */ }
    }
    const id = randomUUID(), label = `${source.label.slice(0, 22).replace(/[\uD800-\uDBFF]$/, '')} (간격 보정)`
    const bytes = await correctFontSpacing(await readFontBytes(await restoreFontUri(source)), { family: `DIOHW-${id.replaceAll('-', '')}`, displayName: label, onProgress })
    return persistFont(bytes, label, { sourceFontId: source.id }, id)
  })().finally(() => spacingTasks.delete(font.id))
  spacingTasks.set(font.id, task)
  return task
}
export async function importLocalFile() {
  const file = await pickLocalFile()
  if (!file) return null
  if (file.name.toLowerCase().endsWith('.ttf')) {
    const font = await persistFont(file.bytes, file.name.replace(/\.ttf$/i, '').slice(0, 30) || '가져온 글꼴')
    return { kind: 'font', font }
  }
  const data = JSON.parse(decodeUtf8(file.bytes))
  if (data.kind === 'dio-handwriting-draft') { const draft = validateDraft(data); await saveDraft(draft); return { kind: 'draft', draft } }
  if (data.kind === 'dio-font' && data.schema === 1 && typeof data.label === 'string') {
    const bytes = fromBase64(data.ttf)
    const source = typeof data.sourceFontId === 'string' && /^personal-[0-9a-f-]{36}$/i.test(data.sourceFontId) && fontSpacingInfo(bytes).spacingVersion ? { sourceFontId: data.sourceFontId } : {}
    const font = await persistFont(bytes, data.label.trim().slice(0, 30) || '가져온 글꼴', source)
    return { kind: 'font', font }
  }
  throw new Error('DIO 손글씨 초안이나 완성 폰트 파일을 선택해 주세요.')
}
export async function exportDraft(draft) { validateDraft(draft); return writeLocalPackage('DIO-손글씨초안.json', JSON.stringify(draft)) }
export async function exportFont(font) {
  const bytes = await readFontBytes(font.uri), info = fontSpacingInfo(bytes)
  return writeLocalPackage(`DIO-${font.id}.json`, JSON.stringify({ kind: 'dio-font', schema: 1, label: font.label,
    ...(info.spacingVersion && { spacingVersion: info.spacingVersion, ...(font.sourceFontId && { sourceFontId: font.sourceFontId }) }), ttf: toBase64(bytes) }))
}
export async function loadLastJob() { return read(JOB_KEY, null) }
export async function saveLastJob(job) { return enqueue(() => AsyncStorage.setItem(JOB_KEY, JSON.stringify(job))) }
