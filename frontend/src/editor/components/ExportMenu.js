import { ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { colors } from '../../shared/theme'
import { pageSize } from '../utils/pageGeometry.js'
import PdfGeneration, { PdfGeneratedPreview } from './PdfGeneration'
import { createMenuPdfSnapshot, menuPdfPolicy, pdfMenuFailure } from '../utils/pdfMenu.js'
import StaticPage from './canvas/StaticPage'
import { exportPageIds, pageListKey } from '../utils/exportSelection.js'

export function ExportButton({ title, onPress, disabled, selected, ...props }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled, selected: !!selected }} disabled={disabled} onPress={onPress} style={[styles.button, selected && styles.selected, disabled && styles.disabled]} {...props}><Text style={styles.text}>{title}</Text></Pressable>
}

export default function ExportMenu({ anchor, doc, currentId, onClose, onRegion, onPng }) {
  const viewport = useWindowDimensions()
  const panelWidth = Math.min(600, viewport.width - 32)
  const panelTop = Math.min(anchor ? anchor.y + anchor.height + 8 : 80, Math.max(16, viewport.height - 200))
  const placement = { position: 'absolute', width: panelWidth, left: Math.max(16, Math.min(anchor ? anchor.x + anchor.width - panelWidth : (viewport.width - panelWidth) / 2, viewport.width - panelWidth - 16)), top: panelTop, maxHeight: viewport.height - panelTop - 16 }
  const [mode, setMode] = useState(null), [format, setFormat] = useState('png')
  const [selected, setSelected] = useState([currentId])
  const number = doc.pages.findIndex((p) => p.id === currentId) + 1
  const [from, setFrom] = useState(String(number)), [to, setTo] = useState(String(number))
  const key = `${pageListKey(doc.pages)}:${currentId}`, [confirmedKey, setConfirmedKey] = useState(key)
  const changed = key !== confirmedKey
  const [job, setJob] = useState({ status: 'idle' }), gate = useRef(false)
  const [attempt, setAttempt] = useState(0)
  const resultRef = useRef(null)
  const exportDoc = useMemo(() => ({ ...doc, pages: doc.pages.map(page => ({ ...page, canvasWidth: pageSize(page).width, canvasHeight: pageSize(page).height })) }), [doc])
  const policy = menuPdfPolicy(exportDoc, pageSize(doc.pages.find(page => page.id === currentId)))
  const maxPages = policy.maxPages
  const request = useRef(null)
  const selectionKey = JSON.stringify([mode, currentId, selected, from, to, format, key])
  const previousSelection = useRef(selectionKey)
  useEffect(() => {
    if (previousSelection.current === selectionKey) return
    previousSelection.current = selectionKey
    if (gate.current) return
    request.current = null
    resultRef.current?.dispose()
    resultRef.current = null
    setJob({ status: 'idle' })
  }, [selectionKey])
  useEffect(() => () => resultRef.current?.dispose(), [])
  useEffect(() => { setSelected((ids) => ids.filter((id) => doc.pages.some((p) => p.id === id))) }, [key])
  let ids = [], invalid = ''
  if (mode) { try { ids = exportPageIds(doc.pages, { mode, currentId, selectedIds: selected, from, to }) } catch (e) { invalid = e.message } }
  if (format === 'pdf' && ids.length > maxPages) invalid = `현재 출력 크기에서는 최대 ${maxPages}페이지까지 만들 수 있어요.`
  const busy = job.status === 'running'
  const close = () => { if (!gate.current) onClose() }
  const resetResult = () => {
    resultRef.current?.dispose()
    resultRef.current = null
    setJob({ status: 'idle' })
  }
  const run = (retry = false) => {
    if (gate.current || (!retry && (changed || invalid))) return
    if (!retry && format === 'png') { gate.current = true; onPng(ids[0]); return }
    try {
      if (!retry) request.current = null
      if (!retry) request.current = createMenuPdfSnapshot(exportDoc, { mode, currentId, selectedIds: selected, from, to }, pageSize(doc.pages.find(page => page.id === currentId)))
      if (!request.current) throw new Error('대상 페이지를 다시 선택해 주세요.')
      resetResult()
      gate.current = true
      setAttempt((n) => n + 1)
      setJob({ status: 'running' })
    } catch (error) { gate.current = false; setJob(pdfMenuFailure(error)) }
  }
  if (busy) return <PdfGeneration key={attempt} snapshot={request.current} onComplete={(result) => {
    resultRef.current = result
    gate.current = false
    setJob({ status: 'ready' })
  }} onFailure={(error) => { gate.current = false; setJob(pdfMenuFailure(error)) }} />
  if (job.status === 'ready' && resultRef.current) return <PdfGeneratedPreview result={resultRef.current} onClose={onClose} onSelectAgain={resetResult} />
  return <Modal visible transparent animationType="fade" onRequestClose={close}>
    <View style={styles.scrim}><View style={[toolPanelStyles.card, styles.card, placement]} accessibilityViewIsModal>
      <ToolPanelHeader icon="share" title="내보내기" onClose={close} disabled={busy} />
      <ScrollView contentContainerStyle={toolPanelStyles.content}>
        {!mode ? <>
          <Text style={styles.hint}>꾸민 추억을 원하는 방식으로 가져가세요.</Text>
          {[
            ['current', '현재 페이지 내보내기', '전체 페이지 · PNG 기본 1배 / PDF'],
            ['pages', '페이지 골라 내보내기', '원하는 페이지를 PDF 한 파일로'],
            ['range', '페이지 범위 내보내기', '시작부터 끝까지 PDF 한 파일로'],
          ].map(([value, label, hint]) => <View key={value}><ExportButton title={label} onPress={() => { setMode(value); setFormat(value === 'current' ? 'png' : 'pdf'); setJob({ status: 'idle' }) }} /><Text style={styles.hint}>{hint}</Text></View>)}
          <ExportButton title="영역 선택 내보내기" onPress={onRegion} disabled={!onRegion} /><Text style={styles.hint}>선택 구역 · PNG · 자유 기본 2배 / 프리셋 지정 크기{!onRegion ? ' · 준비 중' : ''}</Text>
        </> : <>
          <ExportButton title="내보내기 방식으로 돌아가기" disabled={busy} onPress={() => { setMode(null); setJob({ status: 'idle' }) }} />
          {changed && <View><Text accessibilityRole="alert" style={styles.hint}>페이지 목록이나 순서가 바뀌었어요. 선택·범위를 다시 확인해 주세요.</Text><ExportButton title="변경된 페이지 목록 확인" onPress={() => setConfirmedKey(key)} disabled={busy} /></View>}
          {mode === 'current' && <><Text style={styles.hint}>현재 {number}페이지</Text><View style={styles.row}>{['png', 'pdf'].map((value) => <ExportButton key={value} title={value.toUpperCase()} selected={format === value} disabled={busy} onPress={() => { setFormat(value); setJob({ status: 'idle' }) }} />)}</View></>}
          {mode === 'pages' && <>
            <Text style={styles.hint}>선택 {selected.length} / 최대 {maxPages}페이지 · 상한 20장 / 80MP</Text>
            <View style={styles.row}><ExportButton title="전체 선택" disabled={busy || !policy.enabled} onPress={() => setSelected(doc.pages.map((p) => p.id))} /><ExportButton title="전체 해제" disabled={busy} onPress={() => setSelected([])} /></View>
            {!policy.enabled && <Text style={styles.hint}>{policy.reason}</Text>}
            <View style={styles.tiles}>{doc.pages.map((page, index) => <Pressable key={page.id} accessibilityRole="checkbox" accessibilityLabel={`${index + 1}페이지 선택`} accessibilityState={{ checked: selected.includes(page.id), disabled: busy || (!selected.includes(page.id) && selected.length >= maxPages) }} disabled={busy || (!selected.includes(page.id) && selected.length >= maxPages)} onPress={() => setSelected((ids) => ids.includes(page.id) ? ids.filter((id) => id !== page.id) : [...ids, page.id])} style={[styles.tile, selected.includes(page.id) && styles.selected]}>
              <StaticPage page={page} zoom={112 / pageSize(page).width} still /><Text style={styles.text}>{selected.includes(page.id) ? '✓ ' : ''}{index + 1}페이지</Text>
            </Pressable>)}</View>
          </>}
          {mode === 'range' && <View style={styles.row}><Text style={styles.text}>시작</Text><TextInput accessibilityLabel="시작 페이지" value={from} editable={!busy} keyboardType="number-pad" onChangeText={setFrom} style={styles.input} /><Text style={styles.text}>끝</Text><TextInput accessibilityLabel="끝 페이지" value={to} editable={!busy} keyboardType="number-pad" onChangeText={setTo} style={styles.input} /></View>}
          {!!invalid && <Text accessibilityRole="alert" style={styles.hint}>{invalid}</Text>}
          {format === 'pdf' && <Text style={styles.hint}>PDF · {ids.length}페이지 · 이미지 기반 문서입니다. 텍스트를 검색하거나 선택할 수 없어요.</Text>}
          {job.status === 'error' && <Text accessibilityRole="alert" style={styles.hint}>{job.message} 파일은 저장되지 않았어요.</Text>}
          {job.status === 'cancelled' && <Text style={styles.hint}>PDF 생성을 취소했어요. 편집 내용은 그대로예요.</Text>}
          {format === 'pdf' && request.current && ['error', 'cancelled'].includes(job.status) && <ExportButton title="같은 내용으로 다시 만들기" onPress={() => run(true)} />}
          <ExportButton title={format === 'png' ? 'PNG 미리보기' : 'PDF 만들기'} onPress={() => run()} disabled={!!invalid || changed} />
        </>}
      </ScrollView>
    </View></View>
  </Modal>
}
const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: colors.surface, width: '100%', maxWidth: 600, maxHeight: '92%', borderRadius: 20 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  title: { flex: 1, color: colors.text, fontSize: 21, fontWeight: '700' },
  text: { color: colors.text, fontSize: 14 },
  button: { borderRadius: 12, minHeight: 44, justifyContent: 'center', padding: 12, marginVertical: 4, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border },
  selected: { backgroundColor: colors.surfaceSoft, borderColor: colors.primary, borderWidth: 2 },
  disabled: { opacity: 0.45 },
  hint: { color: colors.textMuted, paddingVertical: 8, lineHeight: 21 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: 128, padding: 6, gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  input: { minWidth: 60, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, color: colors.text },
})
