import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { registerRootComponent } from 'expo'
import { Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import EditorScreen from '../src/editor/screens/EditorScreen'
import { editorDocKey, forgetEditorDoc } from '../src/editor/services/editorDocs'
import { colors } from '../src/shared/theme'
import { sameStoredDocument } from './storage-snapshot.js'
import { LARGE_CASES, largeDiary, largeDocument, createLargeRunMetrics, replaceLargeQADocument } from './large-integration.js'
import { cacheDisplay, installLargeInputDiagnostics } from './large-input-diagnostics.js'
import FeedbackButton from './FeedbackButton.js'
import { largeReference } from './large-reference-store.js'
import { strokeThumbnails } from '../src/editor/utils/strokeThumbnailRaster.web.js'

const params = new URLSearchParams(window.location.search)
const selected = LARGE_CASES.find(item => item.id === params.get('case'))
const diary = selected ? largeDiary(selected.id) : null
const key = diary ? editorDocKey(diary) : null
const baselineKey = key ? `dio:qa:large:reference:${selected.id}` : null
const uiItems = ['도구·설정 패널 열기/닫기·스크롤', '페이지·레이어·내보내기 메뉴 열기/닫기', '텍스트 입력·선택·복사·키보드 닫기', '텍스트 링크 대화상자 입력·취소', '획·영역 지우기와 Undo/Redo', '확대·이동 후 도구 전환·필기']
const phaseLabels = { initial: '최초 진입', ready: '캐시 준비 후', zoom: '확대·이동 후', ui: 'UI 확인', restored: '재진입' }
const style = { minHeight: 36, padding: '5px 10px', border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.surface, color: colors.text, touchAction: 'manipulation', whiteSpace: 'nowrap' }
const read = async k => { const raw = await AsyncStorage.getItem(k); return raw ? JSON.parse(raw) : null }
const ActionStatus = createContext({})
function Button({ children, onClick, onPointerDown, disabled, action }) {
  const status = useContext(ActionStatus)[action]
  return <button style={{ ...style, opacity: disabled ? 0.4 : 1 }} disabled={disabled} onPointerDown={onPointerDown} onClick={onClick}>{children}{status ? ` · ${status}` : ''}</button>
}

function LargeQA() {
  const controller = useRef(null), latest = useRef(null), metrics = useRef(createLargeRunMetrics()), diagnostics = useRef(null)
  controller.initialTool = 'pen'
  controller.onCommit = snapshot => { latest.current = snapshot }
  const run = useRef(params.get('run') ?? Date.now().toString(36)), session = useRef(Date.now().toString(36)), sequence = useRef(0)
  const phaseRef = useRef(params.get('entry') === 'restored' ? 'restored' : 'initial')
  const [phase, setPhase] = useState(phaseRef.current), [message, setMessage] = useState('새 조건을 준비한 뒤, 편집 화면이 열리면 바로 연속 필기해 주세요.')
  const [display, setDisplay] = useState({}), [saveStatus, setSaveStatus] = useState('loading'), [loaded, setLoaded] = useState(false)
  const [ui, setUI] = useState({}), [busy, setBusy] = useState(false), [acks, setAcks] = useState({})
  const owned = useRef(new Map()), pending = useRef(new Map()), restoredDoc = useRef(null), preparing = useRef(false)
  const [restoreOK, setRestoreOK] = useState(false)
  const [panelStats, setPanelStats] = useState({ opens: 0, measured: 0, ack: 0, maxGapMs: 0, reused: 0, pending: 0 })
  const panelAcks = useRef(new Set())
  window.__DIO_PERF_CACHE__ = 'production-cache'
  window.__DIO_PERF_CASE__ = { qaMode: 'large-integration', cacheRevision: 'safari-large-v4-page-panel', storageMode: 'async-storage', qaCase: selected?.id ?? 'setup',
    qaRun: run.current, qaSession: session.current, qaPhase: phaseRef.current, fixtureStrokes: selected?.count ?? 0, fixtureIsSynthetic: true }
  const report = (action, details = {}) => {
    const recordId = `large-${session.current}-${++sequence.current}`
    owned.current.set(recordId, action)
    setAcks(current => ({ ...current, [action]: '전송 중' }))
    window.__DIO_PEN_QA_REPORT__({ type: 'large-checkpoint', ...window.__DIO_PERF_CASE__, recordId, action, ...details })
    return recordId
  }
  const switchPhase = next => {
    phaseRef.current = next; window.__DIO_PERF_CASE__.qaPhase = next; setPhase(next)
    report('phase-start', { phase: next, display: cacheDisplay() })
  }
  useEffect(() => {
    diagnostics.current = installLargeInputDiagnostics()
    let active = true, restoredChecked = false, documentReady = false
    const onReport = event => {
      const r = event.detail
      if (r.qaSession !== session.current) return
      metrics.current.record(r)
      if (r.type === 'page-panel' && r.open && r.stage === 'intent') setPanelStats(v => ({ ...v, opens: v.opens + 1 }))
      if (r.type === 'page-panel' && r.open && r.stage === 'frame-window') {
        panelAcks.current.add(r.recordId)
        setPanelStats(v => ({ ...v, measured: v.measured + 1, maxGapMs: r.maxGapMs }))
      }
      if (r.type === 'page-thumbnail' && r.stage === 'plan') setPanelStats(v => ({ ...v, reused: r.reusedBatches, pending: r.pendingBatches }))
      if (r.type === 'page-thumbnail' && r.stage === 'ready') setPanelStats(v => ({ ...v, reused: (r.plannedReusedBatches ?? 0) + (r.lateReusedBatches ?? 0), pending: 0 }))
    }
    const onAck = event => {
      const r = event.detail, action = owned.current.get(r.recordId)
      if (panelAcks.current.has(r.recordId) && r.ok && r.stored) { panelAcks.current.delete(r.recordId); setPanelStats(v => ({ ...v, ack: v.ack + 1 })) }
      if (!action) return
      const ok = r.ok && r.stored
      setAcks(current => ({ ...current, [action]: ok ? '서버 저장 확인' : '전송 실패' }))
      pending.current.get(r.recordId)?.(ok); pending.current.delete(r.recordId)
    }
    window.addEventListener('dio-performance-report', onReport)
    window.addEventListener('dio-performance-ack', onAck)
    const timer = setInterval(async () => {
      const snapshot = latest.current
      if (!snapshot?.loaded) return
      setLoaded(true); setSaveStatus(snapshot.saveStatus)
      const nextDisplay = cacheDisplay()
      setDisplay(previous => previous.readyCaches === nextDisplay.readyCaches && previous.vectorObjects === nextDisplay.vectorObjects && previous.zoom === nextDisplay.zoom ? previous : nextDisplay)
      if (restoredDoc.current && restoredDoc.current !== snapshot.doc) { restoredDoc.current = null; setRestoreOK(false) }
      if (!documentReady) { documentReady = true; report('document-loaded', { navigationToLoadedMs: performance.now(), display: cacheDisplay() }); setMessage('만년필이 선택돼 있습니다. 최초 필기를 바로 시작해 주세요.') }
      if (params.get('entry') !== 'restored' || restoredChecked) return
      restoredChecked = true
      try {
        const [baseline, persisted] = await Promise.all([largeReference('read', baselineKey), read(key)])
        if (!active) return
        const stable = latest.current.doc === snapshot.doc
        const diskMatch = Boolean(baseline?.run === run.current) && sameStoredDocument(baseline?.doc, persisted)
        const editorMatch = stable && sameStoredDocument(baseline?.doc, snapshot.doc)
        restoredDoc.current = diskMatch && editorMatch ? snapshot.doc : null
        setRestoreOK(diskMatch && editorMatch)
        report('restored', { diskMatch, editorMatch, ok: diskMatch && editorMatch, objects: snapshot.doc.pages.reduce((n, page) => n + page.objects.length, 0) })
        setMessage(diskMatch && editorMatch ? '재진입 전체 일치 · 필기와 지운 결과를 육안으로 확인해 주세요.' : '재진입 불일치 · 추가 필기 전에 알려 주세요.')
      } catch (error) { if (active) setMessage(`재진입 검사 실패: ${error.message}`) }
    }, 500)
    return () => { active = false; clearInterval(timer); diagnostics.current?.dispose(); window.removeEventListener('dio-performance-report', onReport); window.removeEventListener('dio-performance-ack', onAck) }
  }, [])

  const prepare = async id => {
    if (busy || preparing.current) return
    preparing.current = true
    setBusy(true); setMessage(`${LARGE_CASES.find(item => item.id === id)?.label} 문서 준비 중…`)
    report('condition-start', { targetCase: id, saveStatus: latest.current?.saveStatus ?? null })
    try {
      if (latest.current && latest.current.saveStatus !== 'saved') throw Error('현재 문서의 자동 저장을 기다려 주세요.')
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const prepared = largeDiary(id), doc = largeDocument(id)
      // The new-condition action resets only this QA's reserved documents. Other
      // QA documents and all user diary/list keys are left alone.
      const size = await replaceLargeQADocument({ storage: AsyncStorage, keys: LARGE_CASES.map(item => editorDocKey(largeDiary(item.id))),
        targetKey: editorDocKey(prepared), doc, forget: forgetEditorDoc })
      report('condition-ready', { targetCase: id, ...size })
      window.location.href = `/?qa=large-integration&case=${id}&run=${Date.now().toString(36)}&entry=initial&v=4`
    } catch (error) {
      const reason = error.storageName === 'QuotaExceededError' ? '시험 문서 저장 공간이 부족합니다.' : error.message
      setMessage(`${reason}${error.rollbackOK === true ? ' 이전 QA 문서는 복구했습니다.' : error.rollbackOK === false ? ' 이전 QA 문서 복구에도 실패했습니다.' : ''} 버튼을 다시 누를 수 있습니다.`)
      report('condition-failed', { targetCase: id, reason, storageError: error.storageName ?? null, rollbackOK: error.rollbackOK ?? null })
      setBusy(false)
    } finally { preparing.current = false }
  }
  const checkpoint = action => {
    const value = metrics.current.snapshot(phaseRef.current)
    if (!value.completed) { setMessage('이 단계에서 필기한 뒤 기록해 주세요.'); return }
    report(action, { metrics: value, display: cacheDisplay(), saveStatus: latest.current?.saveStatus, diagnostics: diagnostics.current?.snapshot() })
    setMessage(`${phaseLabels[phaseRef.current]} 필기 기록 · 수용${value.accepted} / 확정${value.completed} · 서버 확인을 봐주세요.`)
    if (action === 'zoom-record') { phaseRef.current = 'ui'; window.__DIO_PERF_CASE__.qaPhase = 'ui'; setPhase('ui') }
  }
  const reenter = async () => {
    if (busy) return
    setBusy(true)
    try {
      const snapshot = latest.current
      if (!snapshot?.loaded || snapshot.saveStatus !== 'saved') throw Error('자동 저장됨을 기다린 뒤 다시 눌러 주세요.')
      const persisted = await read(key)
      if (latest.current.doc !== snapshot.doc || !sameStoredDocument(snapshot.doc, persisted)) throw Error('화면과 저장소가 아직 다릅니다. 잠시 뒤 다시 눌러 주세요.')
      await largeReference('write', baselineKey, { run: run.current, doc: persisted })
      const id = report('save-before-reentry', { ok: true, diskMatch: true, display: cacheDisplay(), metrics: metrics.current.snapshot(phaseRef.current) })
      const ok = await new Promise(resolve => { const timer = setTimeout(() => { pending.current.delete(id); resolve(false) }, 8000); pending.current.set(id, value => { clearTimeout(timer); resolve(value) }) })
      if (!ok) throw Error('서버 저장 확인에 실패했습니다. 다시 눌러 주세요.')
      window.location.href = `/?qa=large-integration&case=${selected.id}&run=${run.current}&entry=restored&v=4`
    } catch (error) { setMessage(error.message); setBusy(false) }
  }
  return <SafeAreaProvider><ActionStatus.Provider value={acks}><View style={{ flex: 1, backgroundColor: colors.surfaceMuted }}>
    <View style={{ padding: 8, gap: 4 }}>
      <Text style={{ color: colors.text, fontWeight: '700' }}>Safari 대용량·페이지창 QA v4 · {selected?.label ?? '조건 선택'} · 단계 {phaseLabels[phase]} · {saveStatus === 'saved' ? '자동 저장됨' : saveStatus === 'saving' ? '저장 중' : saveStatus === 'loading' ? '문서 준비 전' : '저장 실패'}</Text>
      <Text style={{ color: colors.textMuted }}>{message} 캐시 {display.readyCaches ?? 0}개 / SVG {display.vectorObjects ?? 0}개 · 새 조건은 해당 QA 문서를 다시 만듭니다.</Text>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', paddingBottom: 3 }}>
        {LARGE_CASES.map(item => <Button key={item.id} disabled={busy} onPointerDown={() => report('condition-contact', { targetCase: item.id })} onClick={() => prepare(item.id)}>새 {item.label} 준비</Button>)}
        {selected && <>
          {phase === 'initial' && <><Button disabled={!loaded || busy} action="initial-record" onClick={() => checkpoint('initial-record')}>① 최초 필기 기록</Button>
          <Button disabled={!loaded || busy || acks['initial-record'] !== '서버 저장 확인' || !display.readyCaches || display.vectorObjects !== 0} onClick={() => { switchPhase('ready'); setMessage('캐시 준비 후 같은 방식으로 연속 필기해 주세요.') }}>② 캐시 후 필기 시작</Button></>}
          {phase === 'ready' && <><Button disabled={!loaded || busy} action="ready-record" onClick={() => checkpoint('ready-record')}>③ 캐시 후 기록</Button>
          <Button disabled={!loaded || busy || acks['ready-record'] !== '서버 저장 확인'} onClick={() => { switchPhase('zoom'); setMessage('두 손가락으로 확대·이동하고 바로 연속 필기해 주세요.') }}>④ 확대·이동 시작</Button></>}
          {phase === 'zoom' && <Button disabled={!loaded || busy} action="zoom-record" onClick={() => checkpoint('zoom-record')}>⑤ 확대 후 기록</Button>}
          <Button disabled={!loaded || busy} onClick={reenter}>⑥ 저장·재진입</Button>
        </>}
      </div>
      {selected && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        <FeedbackButton label="실제로 느렸음" value="slow" /><FeedbackButton label="획이 안 남았음" value="missing-stroke" /><FeedbackButton label="UI 문제" value="ui-issue" /><FeedbackButton label="수신 확인만" value="delivery-check-only" />
        <Button action="visual-restored" disabled={!restoreOK || !loaded} onClick={() => {
          if (latest.current?.doc !== restoredDoc.current) { setRestoreOK(false); setMessage('문서가 변경됐습니다. 저장·재진입부터 다시 확인해 주세요.'); return }
          report('visual-restored', { noGapsOrGhosts: true, appearanceMaintained: true })
        }}>재진입 육안 정상</Button>
      </div>}
      {selected && <details style={{ color: colors.text, fontSize: 12 }}><summary>UI QA 체크 · {Object.values(ui).filter(Boolean).length}/{uiItems.length} · 기록 상태 확인</summary>
        <div>페이지창 열기 {panelStats.opens} / 계측 {panelStats.measured} / 서버 확인 {panelStats.ack} · 최근 프레임 공백 {Math.round(panelStats.maxGapMs)}ms · 썸네일 재사용 {panelStats.reused}묶음 / 신규 대기 {panelStats.pending}묶음</div>
        <Button action="thumbnail-cleared" onClick={() => { strokeThumbnails.clear(); report('thumbnail-cleared'); setMessage('썸네일 표시 캐시만 비웠습니다. 페이지 창을 열어 첫 생성을 확인해 주세요.') }}>썸네일 캐시만 비우기</Button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: 120, overflowY: 'auto' }}>{uiItems.map((label, i) => <label key={label}><input type="checkbox" checked={Boolean(ui[i])} onChange={e => setUI(value => ({ ...value, [i]: e.target.checked }))} />{label}</label>)}</div>
        <Button disabled={Object.values(ui).filter(Boolean).length !== uiItems.length} action="ui-confirmed" onClick={() => report('ui-confirmed', { checks: uiItems, ok: true })}>UI 정상 기록</Button>
        <div>{Object.entries(acks).map(([action, status]) => `${action}: ${status}`).join(' / ')}</div>
      </details>}
    </View>
    {selected && <EditorScreen diary={diary} qaController={controller} onHome={() => reenter()} />}
  </View></ActionStatus.Provider></SafeAreaProvider>
}
registerRootComponent(LargeQA)
