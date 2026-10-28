import { useEffect, useMemo, useRef, useState } from 'react'
import { registerRootComponent } from 'expo'
import { Pressable, Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import EditorScreen from '../src/editor/screens/EditorScreen'
import { createSessionDocuments, writeSessionDocument, readSessionDocument } from '../src/editor/services/sessionDocuments.js'
import { PERF_CASES, performanceDoc } from './pen-performance-fixture.js'
import { WebStrokeCacheEnabled, WebStrokeCachePreparation } from '../src/editor/components/canvas/WebStrokeCacheContext'
import { inputArrivalArea } from './input-arrival.js'
import { createStallDiagnostics } from './stall-diagnostics.js'
import FeedbackButton from './FeedbackButton.js'
import { sameQASnapshot } from './snapshot-equality.js'
import { createHistoryProbe } from './history-probe.js'
import { createCachePreparationGate } from './cache-preparation.js'
import { probeDisplayPixels } from './display-pixel-probe.js'

const fallbackQA = new URLSearchParams(window.location.search).get('qa') === 'cache-fallback'
const preparationQA = fallbackQA || new URLSearchParams(window.location.search).get('qa') === 'cache-preparation'
const productionCache = preparationQA || new URLSearchParams(window.location.search).get('qa') === 'editor-cache'
const LOCKED_ZOOM = 0.6
const cacheAB = new URLSearchParams(window.location.search).get('qa') === 'cache-ab'
const standardSVG = new URLSearchParams(window.location.search).get('qa') === 'standard-svg'

function PerformanceQA() {
  const [selected, select] = useState(standardSVG || cacheAB || productionCache ? (preparationQA && !fallbackQA ? '300' : '100') : 'baseline'), [kind, setKind] = useState('fountain'), [revision, reset] = useState(0)
  const qaController = useRef(null)
  const historyProbe = useRef(null)
  if (!historyProbe.current) historyProbe.current = createHistoryProbe({ getController: () => qaController.current })
  qaController.onCommit = snapshot => historyProbe.current.commit(snapshot)
  qaController.onHistoryDispatch = details => window.__DIO_PEN_QA_REPORT__({ type: 'qa-history-dispatch', ...window.__DIO_PERF_CASE__, ...details, requestId: historyProbe.current.getRequestId() })
  const [historyStage, setHistoryStage] = useState('waiting')
  const [conditionAck, setConditionAck] = useState('선택 전송 중')
  const conditionId = useRef(null)
  const [fallbackMode, setFallbackMode] = useState('failure')
  const fallbackCounters = useRef({ expectedFailures: 0, budgetSkipped: 0 })
  const [preparationMode, setPreparationMode] = useState('cold')
  const [recordFeedback, setRecordFeedback] = useState({})
  const [lastRecord, setLastRecord] = useState('아직 기록하지 않았습니다')
  const recordSequence = useRef(0)
  const [preparationStatus, setPreparationStatus] = useState('준비 중')
  const checkpoints = useRef({ before: null, erased: null })
  const gate = useMemo(() => {
    if (!preparationQA) return null
    const control = createCachePreparationGate(preparationMode === 'partial' ? 12 : 0)
    if (!fallbackQA) return control
    control.release()
    return { ...control, faultMode: fallbackMode, pixelBudget: fallbackMode === 'budget' ? 1 : undefined }
  }, [selected, kind, revision, preparationMode, fallbackMode])
  const [rasterCache, setRasterCache] = useState(productionCache)
  const [eraserLog, setEraserLog] = useState({ started: 0, ended: 0, ack: 0 })
  const [currentTool, setCurrentTool] = useState('도구 확인 중')
  const [delivery, setDelivery] = useState('서버 확인 대기')
  const [comparisonStatus, setComparisonStatus] = useState('비교 준비 중…')
  const diagnostics = useRef(null)
  if (!diagnostics.current) diagnostics.current = createStallDiagnostics()
  const comparisonSession = useRef(Date.now().toString(36))
  const [stallCount, setStallCount] = useState(0)
  const displayProbe = useRef({ version: 0, lastVersion: -1, scheduled: false })
  window.__DIO_PERF_CACHE__ = rasterCache ? 'raster' : 'svg'
  const [status, setStatus] = useState('조건을 고르고 필기·지우개를 비교해 주세요')
  const testCase = PERF_CASES.find(item => item.id === selected)
  useEffect(() => {
    let selectionTimer, selectionAttempts = 0, lastSelection, inputSequence = 0
    const inputSession = Date.now().toString(36)
    const streams = new Map()
    const selectionChanged = () => {
      const selection = document.getSelection()
      if (!selection || selection.isCollapsed) return
      selectionAttempts++
      for (const stream of streams.values()) stream.selectionAttempts++
      lastSelection = { ...window.__DIO_PERF_CASE__, rangeCount: selection.rangeCount,
        anchorInCanvas: Boolean(selection.anchorNode?.parentElement?.closest('[aria-label$=" 캔버스"]')) }
      if (!selectionTimer) selectionTimer = setTimeout(() => {
        window.__DIO_PEN_QA_REPORT__({ type: 'browser-selection', ...lastSelection, attempts: selectionAttempts })
        selectionAttempts = 0; selectionTimer = null
      }, 250)
    }
    const penDown = event => {
      const arrival = { inputTraceId: `input-${inputSession}-${++inputSequence}`, started: performance.now(),
        area: inputArrivalArea(event.target), pointerType: event.pointerType || 'unknown' }
      const age = arrival.started - event.timeStamp
      arrival.downEventAgeMs = Number.isFinite(age) && age >= 0 && age < 60000 ? age : null
      window.__DIO_INPUT_ARRIVAL__ = arrival
      diagnostics.current.input({ event: 'pointerdown', pointerType: arrival.pointerType, area: arrival.area, inputTraceId: arrival.inputTraceId, qaCase: window.__DIO_PERF_CASE__?.qaCase })
      const canvas = document.querySelector('[aria-label$=" 캔버스"]')
      streams.set(event.pointerId, { ...window.__DIO_PERF_CASE__, inputZoom: canvas ? parseFloat(canvas.style.width) / 1188 : null,
        visibleCachesAtDown: document.querySelectorAll('canvas[data-dio-cache-ready="true"]').length, cacheMode: window.__DIO_PERF_CACHE__, trustedInput: event.isTrusted,
        arrival,
        started: performance.now(), lastDispatch: performance.now(), lastEvent: event.timeStamp,
        events: 0, maxDispatchGapMs: 0, maxEventGapMs: 0, selectionAttempts: 0 })
    }
    const penMove = event => {
      const stream = streams.get(event.pointerId)
      if (!stream) return
      const now = performance.now()
      stream.events++
      stream.maxDispatchGapMs = Math.max(stream.maxDispatchGapMs, now - stream.lastDispatch)
      stream.maxEventGapMs = Math.max(stream.maxEventGapMs, event.timeStamp - stream.lastEvent)
      stream.lastDispatch = now; stream.lastEvent = event.timeStamp
    }
    const penEnd = (event, endedBy = event.type) => {
      const stream = streams.get(event.pointerId)
      if (!stream) return
      streams.delete(event.pointerId)
      diagnostics.current.input({ event: endedBy, pointerType: stream.arrival.pointerType, area: stream.arrival.area, inputTraceId: stream.arrival.inputTraceId, acceptedSequence: stream.arrival.acceptedSequence, qaCase: window.__DIO_PERF_CASE__?.qaCase })
      const { started, lastDispatch, lastEvent, arrival, ...report } = stream
      window.__DIO_PEN_QA_REPORT__({ type: arrival.pointerType === 'pen' ? 'browser-pen-stream' : 'browser-input-stream', ...report,
        inputTraceId: arrival.inputTraceId, arrivalArea: arrival.area, pointerType: arrival.pointerType,
        acceptedSequence: arrival.acceptedSequence ?? null, downToAcceptedMs: arrival.downToAcceptedMs ?? null,
        downEventAgeMs: arrival.downEventAgeMs,
        visibleCachesAtEnd: document.querySelectorAll('canvas[data-dio-cache-ready="true"]').length,
        endedBy, durationMs: performance.now() - started,
        endDispatchGapMs: performance.now() - lastDispatch, endEventGapMs: event.timeStamp - lastEvent })
    }
    const blur = () => { for (const pointerId of [...streams.keys()]) penEnd({ pointerId, type: 'blur', timeStamp: performance.now() }) }
    const hidden = () => { if (document.hidden) blur() }
    const pointerCancelled = event => {
      if (event.target.closest?.('[aria-label$=" 캔버스"]')) window.__DIO_PEN_QA_REPORT__({ type: 'browser-pointercancel',
        ...window.__DIO_PERF_CASE__, pointerType: event.pointerType, trustedInput: event.isTrusted })
    }
    document.addEventListener('selectionchange', selectionChanged)
    window.addEventListener('pointerdown', penDown, true)
    window.addEventListener('pointermove', penMove, true)
    window.addEventListener('pointerup', penEnd, true)
    window.addEventListener('pointercancel', penEnd, true)
    window.addEventListener('lostpointercapture', penEnd, true)
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pointercancel', pointerCancelled, true)
    return () => {
      clearTimeout(selectionTimer)
      document.removeEventListener('selectionchange', selectionChanged)
      window.removeEventListener('pointerdown', penDown, true)
      window.removeEventListener('pointermove', penMove, true)
      window.removeEventListener('pointerup', penEnd, true)
      window.removeEventListener('pointercancel', penEnd, true)
      window.removeEventListener('lostpointercapture', penEnd, true)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pointercancel', pointerCancelled, true)
    }
  }, [])
  const fixture = useMemo(() => {
    const started = performance.now(), session = createSessionDocuments(), key = session.key('performance-qa')
    const doc = performanceDoc(testCase, kind)
    writeSessionDocument(key, doc)
    window.__DIO_PERF_CASE__ = { qaCase: selected, fixtureKind: kind, fixtureStrokes: testCase.count, fixturePoints: testCase.points,
      storageMode: 'session-memory', faultMode: fallbackQA ? fallbackMode : null, preparationMode: preparationQA ? preparationMode : null, qaMode: fallbackQA ? 'cache-fallback' : preparationQA ? 'cache-preparation' : productionCache ? 'editor-cache' : cacheAB ? 'cache-ab' : standardSVG ? 'standard-svg' : 'cache-comparison', comparisonId: comparisonSession.current + '-' + selected + '-' + kind + '-' + preparationMode + '-' + revision + '-' + (fallbackQA ? fallbackMode : 'none'), cacheRevision: fallbackQA ? 'safari-cache-fallback-v1' : preparationQA ? 'safari-cache-preparation-v7' : productionCache ? 'safari-pen-stall-v6' : 'safari-cache-ab-locked-v2', fixedZoom: cacheAB || preparationQA ? LOCKED_ZOOM : null, revision }
    return { session, diary: { id: 'performance-qa', title: '성능 QA · ' + testCase.label, color: '#CED9EE', sessionStorageKey: key },
      generationMs: performance.now() - started, started }
  }, [selected, kind, revision, preparationMode, fallbackMode])
  useEffect(() => {
    let first, second, cacheStatusTimer
    first = requestAnimationFrame(() => { second = requestAnimationFrame(() => {
      window.__DIO_PEN_QA_REPORT__({ type: 'fixture-ready', ...window.__DIO_PERF_CASE__, generationMs: fixture.generationMs,
        readyFrameMs: performance.now() - fixture.started, svgPaths: document.querySelectorAll('svg path').length,
        heapBytes: performance.memory?.usedJSHeapSize ?? null, heapSupported: Boolean(performance.memory) })
    }) })
    checkpoints.current = { before: null, erased: null }
    fallbackCounters.current = { expectedFailures: 0, budgetSkipped: 0 }
    historyProbe.current.reset()
    setHistoryStage('waiting')
    const choiceId = `${comparisonSession.current}-condition-${++recordSequence.current}`
    conditionId.current = choiceId; setConditionAck('선택 전송 중')
    window.__DIO_PEN_QA_REPORT__({ type: 'preparation-condition', ...window.__DIO_PERF_CASE__, recordId: choiceId, gate: gate?.snapshot() })
    setRecordFeedback({}); setLastRecord('아직 기록하지 않았습니다'); setDelivery('서버 확인 대기')
    const report = event => {
      const r = event.detail
      if (r.comparisonId && r.comparisonId !== window.__DIO_PERF_CASE__?.comparisonId) return
      if (preparationQA && r.type === 'input-accepted' && r.kind !== 'eraser') { historyProbe.current.reset(); setHistoryStage('waiting') }
      if (r.type === 'raster-error' && r.expected) fallbackCounters.current.expectedFailures++
      if (r.type === 'fallback-plan') fallbackCounters.current.budgetSkipped = r.skippedBatches
      if (['input-accepted', 'input-rejected'].includes(r.type)) diagnostics.current.input({ event: r.type, kind: r.kind, reason: r.reason, acceptedSequence: r.sequence, inputTraceId: r.inputTraceId, qaCase: r.qaCase })
      if (['stroke', 'stroke-handoff', 'raster-ready'].includes(r.type)) displayProbe.current.version++
      if (r.type === 'raster-ready') {
        clearTimeout(cacheStatusTimer)
        cacheStatusTimer = setTimeout(() => {
          const root = document.querySelector('[aria-label$=" 캔버스"]')
          if (!root) return
          const ready = [...root.querySelectorAll('canvas[data-dio-stroke-cache]')].filter(node => node.style.display === 'block').length
          setStatus(`캐시 ${ready}개 · 남은 SVG ${root.querySelectorAll('svg').length}개`)
        }, 200)
        return
      }
      if (preparationQA && r.kind === 'eraser' && r.type === 'input-accepted') {
        checkpoints.current.beforeObjects = qaController.current?.doc.pages[0]?.objects ?? null
        setHistoryStage('drawing')
      }
      if (r.kind === 'eraser' && r.type === 'input-accepted') setEraserLog(v => ({ ...v, started: v.started + 1 }))
      if (r.kind === 'eraser' && r.type === 'stroke') setEraserLog(v => ({ ...v, ended: v.ended + 1 }))
      if (preparationQA && r.type === 'stroke' && r.kind === 'eraser' && !r.cancelled) setTimeout(() => checkpoint('erased'), 0)
      if (r.type !== 'stroke') return
      setStatus((r.kind === 'eraser' ? '지우개/' + r.eraserMode : '필기/' + r.kind)
        + ' · 프레임 p95 ' + (r.metrics?.jsFrameGapMs?.p95 ?? 0).toFixed(1) + 'ms'
        + ' · 최대 ' + (r.metrics?.jsFrameGapMs?.max ?? 0).toFixed(1) + 'ms'
        + (r.kind === 'eraser' ? ' · 판정 ' + (r.metrics?.eraserMoveMs?.p95 ?? 0).toFixed(1)
          + ' · 조각 ' + (r.metrics?.eraserFragmentsMs?.p95 ?? 0).toFixed(1)
          + ' · 반영 ' + (r.metrics?.eraserPreviewToLayoutMs?.p95 ?? 0).toFixed(1) + 'ms(p95)' : ''))
    }
    window.addEventListener('dio-performance-report', report)
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); clearTimeout(cacheStatusTimer); window.removeEventListener('dio-performance-report', report); fixture.session.dispose() }
  }, [fixture])
  useEffect(() => {
    if (!cacheAB) return
    setComparisonStatus('비교 준비 중…')
    const metadata = { ...window.__DIO_PERF_CASE__ }
    let stableSince = 0, lastZoom, reported = false
    const timer = setInterval(() => {
      const root = document.querySelector('[aria-label$=" 캔버스"]')
      if (!root) return
      const zoom = parseFloat(root.style.width) / 1188
      const eligible = [...root.querySelectorAll('canvas[data-dio-cache-eligible="true"]')]
      const ready = eligible.filter(node => node.getAttribute('data-dio-cache-ready') === 'true').length
      const settled = Number.isFinite(zoom) && zoom > 0 && Math.abs(zoom - LOCKED_ZOOM) < 0.00001 && (!rasterCache || (eligible.length > 0 && ready === eligible.length))
      if (!settled || zoom !== lastZoom) { stableSince = performance.now(); reported = false }
      lastZoom = zoom
      if (!settled || performance.now() - stableSince < 500) return
      setComparisonStatus(`비교 준비 완료 · 기준 배율 ${zoom.toFixed(4)} · 캐시 ${ready}/${eligible.length}`)
      if (!reported) {
        reported = true
        window.__DIO_PEN_QA_REPORT__({ type: 'ab-ready', ...metadata, cacheMode: rasterCache ? 'raster' : 'svg',
          measuredZoom: zoom, readyCaches: ready, eligibleCaches: eligible.length, svgPaths: root.querySelectorAll('svg path').length })
      }
    }, 250)
    return () => clearInterval(timer)
  }, [fixture, rasterCache])
  useEffect(() => {
    const ack = event => {
      const r = event.detail
      if (r.type === 'preparation-condition' && r.recordId === conditionId.current) setConditionAck(r.ok ? '선택 서버 확인' : '선택 전송 실패')
      if (r.type === 'preparation-checkpoint' && r.recordId) setRecordFeedback(previous => {
        if (previous[r.phase]?.recordId !== r.recordId) return previous
        return { ...previous, [r.phase]: { ...previous[r.phase], delivery: r.ok ? '서버 확인' : '전송 실패' } }
      })
      if (r.kind === 'eraser' && r.type === 'stroke' && r.ok) setEraserLog(v => ({ ...v, ack: v.ack + 1 }))
      if (['stall-marker', 'ui-feedback', 'preparation-checkpoint'].includes(r.type)) setDelivery(r.ok ? '최근 단계 기록 서버 수신 완료' : '버튼 기록 전송 실패')
    }
    window.addEventListener('dio-performance-ack', ack)
    const timer = setInterval(() => setCurrentTool(document.querySelector('[aria-label$=" 캔버스"]')?.getAttribute('aria-label') ?? '도구 확인 중'), 500)
    return () => { clearInterval(timer); window.removeEventListener('dio-performance-ack', ack) }
  }, [])
  useEffect(() => {
    let frame
    const beat = time => { diagnostics.current.frame(time); frame = requestAnimationFrame(beat) }
    frame = requestAnimationFrame(beat)
    const touch = event => {
      for (const contact of Array.from(event.changedTouches ?? [])) diagnostics.current.input({ event: event.type,
        touchType: ['stylus', 'direct'].includes(contact.touchType) ? contact.touchType : 'unknown',
        area: inputArrivalArea(event.target), qaCase: window.__DIO_PERF_CASE__?.qaCase })
    }
    const visibility = () => { diagnostics.current.resetFrame(); diagnostics.current.input({ event: document.hidden ? 'hidden' : 'visible' }) }
    window.addEventListener('touchstart', touch, { capture: true, passive: true })
    window.addEventListener('touchend', touch, { capture: true, passive: true })
    window.addEventListener('touchcancel', touch, { capture: true, passive: true })
    document.addEventListener('visibilitychange', visibility)
    return () => { cancelAnimationFrame(frame); for (const name of ['touchstart', 'touchend', 'touchcancel']) window.removeEventListener(name, touch, true); document.removeEventListener('visibilitychange', visibility) }
  }, [])
  const checkpoint = (phase, historyResult = null) => {
    const doc = historyResult?.doc ?? qaController.current?.doc ?? readSessionDocument(fixture.diary.sessionStorageKey)
    const objects = doc?.pages?.[0]?.objects ?? []
    const checkpointStarted = performance.now()
    if (phase === 'erased') {
      if (checkpoints.current.beforeObjects) checkpoints.current.before = checkpoints.current.beforeObjects
      historyProbe.current.prime()
      setHistoryStage(historyProbe.current.getStage())
    }
    if (phase === 'before' || phase === 'erased') checkpoints.current[phase] = objects
    const root = document.querySelector('[aria-label$=" 캔버스"]')
    const ready = root?.querySelectorAll('canvas[data-dio-cache-ready="true"]').length ?? 0
    const beforeMatch = checkpoints.current.before == null ? null : sameQASnapshot(objects, checkpoints.current.before)
    const erasedMatch = checkpoints.current.erased == null ? null : sameQASnapshot(objects, checkpoints.current.erased)
    const recordId = `${comparisonSession.current}-${++recordSequence.current}`
    setRecordFeedback(previous => ({ ...previous, [phase]: { count: (previous[phase]?.count ?? 0) + 1, recordId, delivery: '전송 중' } }))
    window.__DIO_PEN_QA_REPORT__({ type: 'preparation-checkpoint', ...window.__DIO_PERF_CASE__, phase, recordId,
      objectCount: objects.length, pointCount: objects.reduce((n, o) => n + (o.points?.length ?? 0), 0),
      beforeMatch,
      erasedMatch, checkpointJsMs: performance.now() - checkpointStarted,
      readyCaches: ready, gate: gate?.snapshot(),
      preciseSvgObjects: root?.querySelectorAll('[data-completed-stroke-id][data-ink-quality="precise"]').length ?? 0,
      temporarySvgObjects: root?.querySelectorAll('[data-completed-stroke-id][data-ink-quality="temporary"]').length ?? 0,
      fallback: fallbackQA ? { ...fallbackCounters.current } : null,
      history: historyResult ? { requestId: historyResult.requestId, executions: historyResult.executions, oneStep: historyResult.oneStep, beforePast: historyResult.beforePast, beforeFuture: historyResult.beforeFuture, afterPast: historyResult.past, afterFuture: historyResult.future, observedEditorCommit: true } : null })
    setLastRecord(`${({ before: '지우기 전', erased: '지우기 후', release: '정밀 복원 시작', restored: '복원 확인', fallback: '정밀 SVG 대체', 'svg-undo': 'Undo 후 정밀 SVG', 'svg-redo': 'Redo 후 정밀 SVG', undo: 'Undo 결과', redo: 'Redo 결과' })[phase] ?? phase} 기록 · ${objects.length}개 객체 · 캐시 ${ready}개${phase === 'undo' ? (beforeMatch ? ' · 원본 일치' : ' · 원본 불일치/기준 없음') : phase === 'redo' || phase === 'restored' ? (erasedMatch ? ' · 지운 결과 일치' : ' · 지운 결과 불일치/기준 없음') : ''}`)
  }
  useEffect(() => {
    if (!preparationQA) return
    let last = ''
    const timer = setInterval(() => {
      const root = document.querySelector('[aria-label$=" 캔버스"]')
      if (!root) return
      const ready = root.querySelectorAll('canvas[data-dio-cache-ready="true"]').length
      const vectors = root.querySelectorAll('[data-completed-stroke-id]').length
      const precise = root.querySelectorAll('[data-completed-stroke-id][data-ink-quality="precise"]').length
      const temporary = root.querySelectorAll('[data-completed-stroke-id][data-ink-quality="temporary"]').length
      const attempted = fallbackMode === 'failure' ? fallbackCounters.current.expectedFailures : fallbackCounters.current.budgetSkipped
      const fallbackValue = `${attempted > 0 && ready === 0 && precise > 0 && temporary === 0 ? '정밀 SVG 대체 준비 완료' : 'SVG 대체 준비 중'} · 정밀 ${precise}획 / 임시 ${temporary}획 · 캐시 ${ready}개 · ${fallbackMode === 'failure' ? '예상 실패' : '예산 제외'} ${attempted}묶음`
      const value = fallbackQA ? fallbackValue : `${gate.snapshot().released ? (vectors === 0 && ready > 0 ? '정밀 캐시 준비 완료' : '정밀 캐시 복원 중') : preparationMode === 'cold' ? '미준비 유지' : '부분 준비 유지'} · 캐시 ${ready}개 · 벡터 ${vectors}획`
      if (value !== last) { last = value; setPreparationStatus(value) }
    }, 250)
    return () => clearInterval(timer)
  }, [gate, preparationMode, fallbackMode])
  const historyStep = async phase => {
    const id = `${comparisonSession.current}-history-${++recordSequence.current}`
    const promise = historyProbe.current.run(phase, id)
    if (!promise) return
    setHistoryStage('busy')
    try {
      const result = await promise
      if (!result) return
      checkpoint(phase, result)
      if (fallbackQA) {
        const expected = result.doc.pages[0].objects.filter(object => object.type === 'stroke' && !object.hidden).length
        const started = performance.now()
        await new Promise((resolve, reject) => {
          const check = () => {
            if (qaController.current?.doc !== result.doc) { reject(Error('Document changed during SVG check')); return }
            const root = document.querySelector('[aria-label$=" 캔버스"]')
            const precise = root?.querySelectorAll('[data-completed-stroke-id][data-ink-quality="precise"]').length ?? 0
            const temporary = root?.querySelectorAll('[data-completed-stroke-id][data-ink-quality="temporary"]').length ?? 0
            const ready = root?.querySelectorAll('canvas[data-dio-cache-ready="true"]').length ?? 0
            if (precise === expected && temporary === 0 && ready === 0) { resolve(); return }
            if (performance.now() - started > 10000) { reject(Error('Precise SVG fallback timeout')); return }
            setTimeout(check, 50)
          }
          check()
        })
        checkpoint('svg-' + phase, result)
      }
      setHistoryStage(historyProbe.current.getStage())
      if (!result.oneStep) setLastRecord('이력 단계 불일치 · 다시 초기화해 주세요')
    } catch (error) {
      setHistoryStage(historyProbe.current.getStage())
      setLastRecord(`이력 확인 실패: ${error.message}`)
      window.__DIO_PEN_QA_REPORT__({ type: 'qa-history-error', ...window.__DIO_PERF_CASE__, requestId: id, message: error.message })
    }
  }
  const switchCache = () => {
    setRasterCache(value => !value)
    if (cacheAB) reset(value => value + 1)
  }
  const button = (label, active, action, key = label, disabled = false) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ selected: active, disabled }}
    onPress={action} style={{ opacity: disabled ? 0.45 : 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: active ? '#DCE6FA' : '#FFFFFF', borderWidth: 1, borderColor: '#CBD1DB' }}>
    <Text style={{ color: '#253352', fontSize: 13, fontWeight: active ? '700' : '400' }}>{active ? '✓ ' : ''}{label}</Text></Pressable>
  const recordButton = (label, phase, action = () => checkpoint(phase), disabled = false) => {
    const r = recordFeedback[phase]
    return button(`${label} · ${r ? `${r.count}회 / ${r.delivery}` : '미기록'}`, Boolean(r), action, phase, disabled)
  }
  return <SafeAreaProvider><View style={{ flex: 1, backgroundColor: '#EDF1F8' }}>
    <View style={{ padding: 8, gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Text style={{ fontWeight: '700' }}>미리 쌓을 획</Text>
        {PERF_CASES.filter(item => !(cacheAB || productionCache) || ['100', '300', 'long30'].includes(item.id)).map(item => button(item.label, selected === item.id, () => select(item.id)))}
        {[['fountain', '만년필'], ['brush', '붓펜'], ['felt', '펠트펜']].map(([id, label]) => button(label, kind === id, () => setKind(id)))}
        {button('같은 조건 초기화', false, () => reset(value => value + 1))}
        {productionCache ? <Text style={{ fontWeight: '700', color: '#253352' }}>{preparationQA ? (fallbackQA ? '실패·예산 대체 QA v1 · 배율 0.6 고정' : '재사용·수신 확인 v7 · 배율 0.6 고정') : '정식 웹 캐시 · 확대·이동 가능'}</Text> : standardSVG ? <Text style={{ fontWeight: '700', color: '#253352' }}>일반 경로 · 캐시 꺼짐 고정</Text> : button(rasterCache ? '캐시 켜짐' : '캐시 꺼짐', rasterCache, switchCache)}
        {button('UI 정상', false, () => window.__DIO_PEN_QA_REPORT__({ type: 'ui-feedback', ...window.__DIO_PERF_CASE__, value: 'normal' }))}
        {button('UI 문제', false, () => window.__DIO_PEN_QA_REPORT__({ type: 'ui-feedback', ...window.__DIO_PERF_CASE__, value: 'problem' }))}
        <FeedbackButton key={'smooth-' + fixture.diary.sessionStorageKey} label="원활" value="smooth" />
        <FeedbackButton key={'slow-' + fixture.diary.sessionStorageKey} label="느림" value="slow" />
        {button(`방금 필기 멈춤 (${stallCount})`, stallCount > 0, () => {
          window.__DIO_PEN_QA_REPORT__({ type: 'stall-marker', ...window.__DIO_PERF_CASE__, diagnostics: diagnostics.current.snapshot() })
          setStallCount(count => count + 1)
          const probe = displayProbe.current, root = document.querySelector('[aria-label$=" 캔버스"]')
          if (!standardSVG && !cacheAB && !productionCache && root && !probe.scheduled && probe.lastVersion !== probe.version) {
            const metadata = { ...window.__DIO_PERF_CASE__ }
            probe.scheduled = true; probe.lastVersion = probe.version
            setTimeout(() => {
              probe.scheduled = false
              if (root.isConnected) window.__DIO_PEN_QA_REPORT__({ type: 'display-pixel-probe', ...metadata, ...probeDisplayPixels(root) })
            }, 0)
          }
        })}
      </View>
      {preparationQA && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {!fallbackQA && button('미준비 다시 시작', preparationMode === 'cold', () => { setPreparationMode('cold'); reset(v => v + 1) })}
        {!fallbackQA && button('부분 준비 다시 시작', preparationMode === 'partial', () => { setPreparationMode('partial'); reset(v => v + 1) })}
        {fallbackQA && button('캐시 실패 다시 시작', fallbackMode === 'failure', () => { setFallbackMode('failure'); reset(v => v + 1) })}
        {fallbackQA && button('예산 초과 다시 시작', fallbackMode === 'budget', () => { setFallbackMode('budget'); reset(v => v + 1) })}
        {recordButton('① 지우기 전 기록', 'before')}
        {!fallbackQA && recordButton('② 정밀 복원 시작', 'release', () => { gate.release(); checkpoint('release') })}
        {fallbackQA ? recordButton('② 정밀 SVG 확인 기록', 'fallback') : recordButton('③ 복원 확인 기록', 'restored')}
        {recordButton('④ 마지막 지우기 1회 Undo', 'undo', () => historyStep('undo'), historyStage !== 'erased')}
        {recordButton('⑤ 같은 지우기 1회 Redo', 'redo', () => historyStep('redo'), historyStage !== 'undone')}
        <Text style={{ fontSize: 12, fontWeight: '700' }}>현재 조건: {fallbackQA ? (fallbackMode === 'failure' ? '캐시 실패 유도' : '픽셀 예산 1px로 제한') : preparationMode === 'cold' ? '미준비 (0개 제한)' : '부분 준비 (12개 제한)'} · {conditionAck} · {preparationStatus}</Text>
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: '#253352' }}>마지막 기록: {lastRecord}</Text>
      </View>}
      {productionCache && <Text style={{ fontSize: 12, color: '#475467', height: 36 }}>{currentTool} · 지우개 시작 {eraserLog.started} / 완료 {eraserLog.ended} / 서버 확인 {eraserLog.ack}{'\n'}{delivery}</Text>}
      {fallbackQA && <Text style={{ fontSize: 12 }}>지우개 선택 → 정밀 SVG 대체 준비 완료 확인 → ① → 영역 지우기 → 정밀 SVG 대체 준비 완료 → ② → ④ Undo → ⑤ Redo. 각 이력 후에도 정밀 SVG 표시·빈틈·잔상을 확인합니다. 예상 실패는 시험 조건입니다.</Text>}
      {preparationQA && !fallbackQA && <Text style={{ fontSize: 12 }}>캐시 0개 또는 12개에서 지우기 전 기록 → 영역 지우기 → 정밀 복원 시작 → 기다린 뒤 복원 확인 기록. ④·⑤ 버튼이 마지막 지우기 1회의 Undo/Redo와 기록을 함께 실행합니다. 조건 변경은 시험 필기를 초기화합니다.</Text>}
      {productionCache && !preparationQA && <Text style={{ fontSize: 12, color: '#475467' }}>연속 필기·두 획 사이 멈춤 → 즉시 멈춤 버튼. 지우개·Undo/Redo·확대 후 필기도 확인해 주세요. 조건 변경·초기화·새로고침은 시험 필기를 지웁니다.</Text>}
      {cacheAB && <Text style={{ fontSize: 12, color: '#475467', height: 54 }}>실제 배율 0.6000 고정 · 확대·이동 차단. 캐시 전환마다 같은 원본 문서로 초기화합니다. 시험 필기는 전환 시 지워집니다.{'\n'}{comparisonStatus}</Text>}
      {standardSVG && <Text style={{ fontSize: 12, color: '#475467' }}>각 조건에서 30초 연속 필기 → 지우개 → 두 손가락 확대·이동. 펜 설정·색상 입력·패널 열기/닫기도 확인해 주세요. 조건 변경·초기화·새로고침은 시험 필기를 지웁니다.</Text>}
      <Text style={{ fontSize: 12, color: '#475467' }}>{testCase.count}획 × {testCase.points}좌표 · 렌더/입력 측정 · 자동저장 디스크 비용 제외 · {status}</Text>
    </View>
    <WebStrokeCachePreparation.Provider value={gate}>
    <WebStrokeCacheEnabled.Provider value={productionCache ? null : rasterCache}>
      <EditorScreen qaController={preparationQA ? qaController : null} fixedViewportZoom={cacheAB || preparationQA ? LOCKED_ZOOM : null} key={selected + kind + revision + preparationMode + fallbackMode} diary={fixture.diary} onHome={() => reset(value => value + 1)} />
    </WebStrokeCacheEnabled.Provider>
    </WebStrokeCachePreparation.Provider>
  </View></SafeAreaProvider>
}
registerRootComponent(PerformanceQA)
