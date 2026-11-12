import { useEffect, useRef, useState } from 'react'
import { registerRootComponent } from 'expo'
import { Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import EditorScreen from '../src/editor/screens/EditorScreen'
import { editorDocKey } from '../src/editor/services/editorDocs'
import { colors } from '../src/shared/theme'
import { sameStoredDocument, storageSummary } from './storage-snapshot.js'

const diary = { id: 'safari-storage-integration-v1', title: 'Safari 저장 통합 QA', color: colors.surfaceSoft,
  templateConfig: { version: 2, dateMode: 'undated', orientation: 'landscape', cover: false, dividers: false, monthly: false, weekly: false, daily: false } }
const key = editorDocKey(diary)
const checkpointKey = 'dio:qa:storage-integration:checkpoint:v1'
const read = async storageKey => { const raw = await AsyncStorage.getItem(storageKey); return raw ? JSON.parse(raw) : null }
const buttonStyle = { padding: '8px 12px', minHeight: 40, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, background: colors.surface, touchAction: 'manipulation' }

function StorageQA() {
  const controller = useRef(null), latest = useRef(null), busy = useRef(false), sequence = useRef(0)
  const run = useRef(Date.now().toString(36))
  const [status, setStatus] = useState('저장 문서를 불러오는 중'), [saved, setSaved] = useState('불러오는 중')
  const [summary, setSummary] = useState(null), [ack, setAck] = useState('아직 기록하지 않았습니다')
  const [restored, setRestored] = useState(false)
  const lastRecord = useRef(null), restoredDoc = useRef(null)
  window.__DIO_PERF_CACHE__ = 'production-cache'
  window.__DIO_PERF_CASE__ = { qaMode: 'storage-integration', cacheRevision: 'safari-storage-v1', storageMode: 'async-storage', qaSession: run.current }
  controller.onCommit = snapshot => { latest.current = snapshot }
  const report = (phase, details) => {
    const recordId = `${run.current}-${++sequence.current}`
    lastRecord.current = recordId; setAck(`${phase} · 서버 전송 중`)
    window.__DIO_PEN_QA_REPORT__({ type: 'storage-checkpoint', ...window.__DIO_PERF_CASE__, recordId, phase, ...details })
  }
  useEffect(() => {
    const listener = event => {
      if (event.detail.recordId === lastRecord.current) setAck(event.detail.ok && event.detail.stored ? '서버 저장 확인' : '서버 전송 실패 · 다시 기록해 주세요')
    }
    window.addEventListener('dio-performance-ack', listener)
    let active = true, checked = false
    const timer = setInterval(async () => {
      const snapshot = latest.current
      if (!snapshot?.loaded) return
      setSaved(snapshot.saveStatus === 'saved' ? '자동 저장됨' : snapshot.saveStatus === 'saving' ? '저장 중' : '저장 실패')
      if (restoredDoc.current && restoredDoc.current !== snapshot.doc) {
        restoredDoc.current = null; setRestored(false)
        setStatus('문서가 변경됐습니다. 자동 저장 후 ① 또는 ②로 다시 기준을 기록해 주세요.')
      }
      if (checked) return
      checked = true
      try {
        const [checkpoint, persisted] = await Promise.all([read(checkpointKey), read(key)])
        if (!active) return
        if (latest.current.doc !== snapshot.doc) throw Error('검사 중 문서가 변경됐습니다. 새로고침 후 잠시 기다려 주세요.')
        if (!checkpoint) { setStatus('① 만년필·펠트펜으로 필기한 뒤 자동 저장을 기다려 주세요.'); return }
        const diskMatch = sameStoredDocument(checkpoint.doc, persisted)
        const editorMatch = sameStoredDocument(checkpoint.doc, snapshot.doc)
        const ok = diskMatch && editorMatch
        restoredDoc.current = ok ? snapshot.doc : null
        setRestored(ok); setSummary(storageSummary(snapshot.doc))
        setStatus(ok ? `재진입 일치 · ${checkpoint.phase === 'save-erased' ? '지운 결과' : '필기'} 기준 / 필압·재질·좌표 전체 일치` : '재진입 불일치 · 추가 필기 전에 알려 주세요')
        report('restored', { ok, diskMatch, editorMatch, referencePhase: checkpoint.phase, summary: storageSummary(snapshot.doc) })
      } catch (error) { if (active) setStatus(`불러오기 검사 실패: ${error.message}`) }
    }, 500)
    return () => { active = false; clearInterval(timer); window.removeEventListener('dio-performance-ack', listener) }
  }, [])

  const capture = async phase => {
    if (busy.current) return
    busy.current = true
    try {
      const snapshot = latest.current
      if (!snapshot?.loaded || snapshot.saveStatus !== 'saved') throw Error('자동 저장됨 표시를 기다린 뒤 다시 눌러 주세요.')
      const persisted = await read(key)
      if (latest.current.doc !== snapshot.doc || !sameStoredDocument(snapshot.doc, persisted)) throw Error('화면과 저장소가 아직 일치하지 않습니다. 필기를 멈추고 잠시 뒤 다시 눌러 주세요.')
      const previous = await read(checkpointKey)
      const changedSincePrevious = previous ? !sameStoredDocument(previous.doc, persisted) : null
      if (phase === 'save-erased' && (!previous || !changedSincePrevious)) throw Error('먼저 ①로 필기 기준을 기록하고, 획·영역 지우기를 실행해 주세요.')
      await AsyncStorage.setItem(checkpointKey, JSON.stringify({ phase, doc: persisted }))
      restoredDoc.current = null; setRestored(false); setSummary(storageSummary(persisted))
      setStatus(`${phase === 'save-writing' ? '필기' : '지운 결과'} 저장소 직접 읽기 일치 · ③으로 재진입해 주세요`)
      report(phase, { ok: true, diskMatch: true, changedSincePrevious, summary: storageSummary(persisted) })
    } catch (error) { setStatus(error.message); report(phase, { ok: false, reason: error.message }) }
    finally { busy.current = false }
  }

  return <SafeAreaProvider><View style={{ flex: 1, backgroundColor: colors.surfaceMuted }}>
    <View style={{ padding: 10, gap: 5 }}>
      <Text style={{ color: colors.text, fontWeight: '700' }}>Safari 저장 통합 QA v1 · {saved}</Text>
      <Text style={{ color: colors.text }}>{status}</Text>
      {summary && <Text style={{ color: colors.textMuted }}>{Object.entries(summary.kinds).map(([kind, item]) => `${kind}: ${item.strokes}획 / 필압 ${item.forceMin ?? '없음'}~${item.forceMax ?? '없음'} / 재질 v${Object.keys(item.versions).join(',')}`).join(' · ')}</Text>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={buttonStyle} onClick={() => capture('save-writing')}>① 필기 저장 확인</button>
        <button style={buttonStyle} onClick={() => capture('save-erased')}>② 지우기 저장 확인</button>
        <button style={buttonStyle} onClick={() => {
          if (busy.current || latest.current?.saveStatus !== 'saved') { setStatus('자동 저장됨 표시를 기다려 주세요.'); return }
          window.location.reload()
        }}>③ 새로고침·재진입</button>
        <button style={{ ...buttonStyle, opacity: restored ? 1 : 0.4 }} disabled={!restored} onClick={() => {
          if (latest.current?.doc !== restoredDoc.current) { setRestored(false); setStatus('문서가 변경됐습니다. 저장 확인부터 다시 진행해 주세요.'); return }
          report('visual-confirmed', { ok: true, noGapsOrGhosts: true, materialAppearanceMaintained: true })
        }}>④ 재질·지운 결과 육안 정상</button>
      </div>
      <Text style={{ color: colors.textMuted }}>{ack} · 이 Safari의 QA 전용 다이어리에 저장됩니다. Undo 이력은 재진입 시 초기화됩니다.</Text>
    </View>
    <EditorScreen diary={diary} qaController={controller} onHome={() => { if (latest.current?.saveStatus === 'saved') window.location.reload(); else setStatus('자동 저장을 기다려 주세요.') }} />
  </View></SafeAreaProvider>
}

registerRootComponent(StorageQA)
