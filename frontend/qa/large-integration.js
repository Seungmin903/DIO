import { PERF_CASES, performanceDoc } from './pen-performance-fixture.js'
import { colors } from '../src/shared/theme.js'

export const LARGE_CASES = PERF_CASES.filter(item => ['100', '300', 'long30'].includes(item.id))
export const largeDiary = id => ({ id: `safari-large-v1-${id}`, title: `대용량 QA · ${LARGE_CASES.find(item => item.id === id)?.label ?? id}`, color: colors.surfaceSoft })
export function largeDocument(id) {
  const testCase = LARGE_CASES.find(item => item.id === id)
  if (!testCase) throw Error('지원하지 않는 QA 조건입니다.')
  const fountain = performanceDoc(testCase, 'fountain'), felt = performanceDoc(testCase, 'felt')
  const round = value => Math.round(value * 100) / 100
  return { ...fountain, ...largeDiary(id), pages: fountain.pages.map(page => ({ ...page,
    objects: page.objects.map((object, index) => {
      const original = index % 2 ? felt.pages[0].objects[index] : object
      // Compact synthetic fixtures only. Force remains variable; distances are
      // derived from geometry and speed uses the renderer's normal fallback.
      // Do not change the production serializer or actual user input precision.
      return { ...original, points: original.points.map(point => ({ x: round(point.x), y: round(point.y), pressure: round(point.pressure), force: round(point.force) })) }
    }) })) }
}

export async function replaceLargeQADocument({ storage, keys, targetKey, doc, forget = () => {} }) {
  if (!keys.includes(targetKey)) throw Error('QA 예약 키가 아닙니다.')
  const raw = JSON.stringify(doc)
  if (raw.length * 2 > 4 * 1024 * 1024) throw Error('QA 합성 문서 예산 초과')
  const backups = await Promise.all(keys.map(async key => [key, await storage.getItem(key)]))
  try {
    for (const key of keys) await storage.removeItem(key)
    await storage.setItem(targetKey, raw)
    if (await storage.getItem(targetKey) !== raw) throw Error('QA 저장 재확인 실패')
  } catch (cause) {
    let rollbackOK = true
    try {
      for (const key of keys) await storage.removeItem(key)
      for (const [key, value] of backups) if (value !== null) await storage.setItem(key, value)
    } catch { rollbackOK = false }
    const error = new Error('QA 문서 준비 실패', { cause })
    error.storageName = cause.name; error.rollbackOK = rollbackOK
    throw error
  }
  keys.forEach(forget)
  return { characters: raw.length, utf16Bytes: raw.length * 2 }
}

export function createLargeRunMetrics() {
  const phases = new Map()
  return {
    record(report) {
      const phase = report.qaPhase ?? 'unknown'
      if (!phases.has(phase)) phases.set(phase, { accepted: new Set(), completed: new Set(), handedOff: new Set(), cancelled: 0, rejected: 0, maxFrameGapMs: 0, maxFirstPreviewMs: 0 })
      const value = phases.get(phase)
      if (report.kind === 'eraser') return
      if (report.type === 'input-accepted') value.accepted.add(report.sequence)
      if (report.type === 'input-rejected') value.rejected++
      if (report.type === 'stroke') {
        if (report.cancelled) value.cancelled++
        else value.completed.add(report.sequence)
        value.maxFrameGapMs = Math.max(value.maxFrameGapMs, report.metrics?.jsFrameGapMs?.max ?? 0)
        value.maxFirstPreviewMs = Math.max(value.maxFirstPreviewMs, report.metrics?.firstPreviewCommitMs?.max ?? 0)
      }
      if (report.type === 'stroke-handoff' && report.reason === 'committed') value.handedOff.add(report.sequence)
    },
    snapshot(phase) {
      const value = phases.get(phase)
      return value ? { accepted: value.accepted.size, completed: value.completed.size, handedOff: value.handedOff.size,
        cancelled: value.cancelled, rejected: value.rejected, maxFrameGapMs: value.maxFrameGapMs, maxFirstPreviewMs: value.maxFirstPreviewMs } : { accepted: 0, completed: 0, handedOff: 0, cancelled: 0, rejected: 0 }
    },
  }
}
