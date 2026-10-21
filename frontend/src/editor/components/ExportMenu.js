import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { colors } from '../../shared/theme'
import { pageSize } from '../utils/pageGeometry.js'
import PdfGeneration, { PdfGeneratedPreview } from './PdfGeneration'
import { createMenuPdfSnapshot, menuPdfPolicy, pdfMenuFailure } from '../utils/pdfMenu.js'
import StaticPage from './canvas/StaticPage'
import { exportPageIds, pageListKey } from '../utils/exportSelection.js'

export function ExportButton({ title, onPress, disabled, selected, primary, ...props }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled, selected: !!selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, primary && styles.primary, selected && styles.selected, pressed && styles.pressed, disabled && styles.disabled]} {...props}>
    <Text style={[styles.buttonText, primary && styles.primaryText]}>{title}</Text>
  </Pressable>
}

// 무엇을 내보낼지 (도구 옵션 창처럼 한 화면에서 고른다)
const MODES = [
  { id: 'current', label: '현재 페이지' },
  { id: 'pages', label: '페이지 선택' },
  { id: 'range', label: '범위' },
  { id: 'region', label: '영역' },
]
const FORMATS = [{ id: 'png', label: 'PNG' }, { id: 'pdf', label: 'PDF' }]
const BUBBLE_WIDTH = 380

export default function ExportMenu({ anchor, doc, currentId, onClose, onRegion, onPng }) {
  const viewport = useWindowDimensions()
  // 말풍선: 내보내기 버튼 바로 아래, 오른쪽 끝을 버튼에 맞추고 꼬리가 버튼 가운데를 가리킨다
  const panelWidth = Math.min(BUBBLE_WIDTH, viewport.width - 32)
  const panelTop = Math.min(anchor ? anchor.y + anchor.height + 12 : 80, Math.max(16, viewport.height - 200))
  const panelLeft = Math.max(16, Math.min(anchor ? anchor.x + anchor.width - panelWidth : (viewport.width - panelWidth) / 2, viewport.width - panelWidth - 16))
  const tailLeft = anchor ? Math.min(panelWidth - 28, Math.max(16, anchor.x + anchor.width / 2 - panelLeft - 8)) : null
  const placement = { position: 'absolute', width: panelWidth, left: panelLeft, top: panelTop, maxHeight: viewport.height - panelTop - 16 }
  const [mode, setMode] = useState('current'), [format, setFormat] = useState('png')
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
  if (mode && mode !== 'region') { try { ids = exportPageIds(doc.pages, { mode, currentId, selectedIds: selected, from, to }) } catch (e) { invalid = e.message } }
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
  const chooseMode = (value) => {
    setMode(value)
    setFormat(value === 'current' ? format : value === 'region' ? 'png' : 'pdf')
    setJob({ status: 'idle' })
  }
  return <Modal visible transparent animationType="fade" onRequestClose={close}>
    {/* 화면을 어둡게 덮지 않는다 (덮으면 뒤의 요소가 반투명해 보였다). 바깥을 누르면 닫는다 */}
    <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="내보내기 닫기" />
    {/* 꼬리는 카드 바깥에 그린다 (카드 안에 두면 둥근 모서리 자르기에 가려졌다) */}
    {tailLeft != null && <View pointerEvents="none" style={[styles.tail, { left: panelLeft + tailLeft, top: panelTop - 7 }]} />}
    <View style={[toolPanelStyles.card, styles.card, placement]} accessibilityViewIsModal>
      <ToolPanelHeader icon="share" title="내보내기" closeLabel="내보내기 창 닫기" onClose={close} disabled={busy} />
      <ScrollView contentContainerStyle={toolPanelStyles.content}>
        <Text style={toolPanelStyles.label}>내보낼 범위</Text>
        <Segmented items={MODES.map((item) => (item.id === 'region' && !onRegion ? { ...item, label: '영역' } : item))} selected={(id) => mode === id} onPress={chooseMode} disabled={busy} />
        {changed && mode !== 'region' && <View style={styles.notice}><Text accessibilityRole="alert" style={styles.hint}>페이지 목록이나 순서가 바뀌었어요. 선택·범위를 다시 확인해 주세요.</Text><ExportButton title="변경된 페이지 목록 확인" onPress={() => setConfirmedKey(key)} disabled={busy} /></View>}

        {mode === 'current' && <>
          <Text style={toolPanelStyles.label}>형식</Text>
          <Segmented items={FORMATS} selected={(id) => format === id} onPress={(value) => { setFormat(value); setJob({ status: 'idle' }) }} disabled={busy} />
          <Text style={styles.hint}>{number}페이지 · {format === 'png' ? 'PNG 이미지 (기본 1배)' : 'PDF 한 파일'}</Text>
        </>}

        {mode === 'pages' && <>
          <View style={styles.between}>
            <Text style={toolPanelStyles.label}>페이지 {selected.length} / 최대 {maxPages}</Text>
            <View style={styles.row}><ExportButton title="전체 선택" disabled={busy || !policy.enabled} onPress={() => setSelected(doc.pages.map((p) => p.id))} /><ExportButton title="전체 해제" disabled={busy} onPress={() => setSelected([])} /></View>
          </View>
          {!policy.enabled && <Text style={styles.hint}>{policy.reason}</Text>}
          <View style={styles.tiles}>{doc.pages.map((page, index) => {
            const on = selected.includes(page.id), blocked = busy || (!on && selected.length >= maxPages)
            return <Pressable key={page.id} accessibilityRole="checkbox" accessibilityLabel={`${index + 1}페이지 선택`} accessibilityState={{ checked: on, disabled: blocked }} disabled={blocked}
              onPress={() => setSelected((list) => list.includes(page.id) ? list.filter((id) => id !== page.id) : [...list, page.id])} style={[styles.tile, on && styles.tileOn]}>
              <View style={styles.tileThumb} pointerEvents="none"><StaticPage page={page} zoom={96 / pageSize(page).width} still /></View>
              <Text style={[styles.tileText, on && styles.tileTextOn]}>{index + 1}</Text>
            </Pressable>
          })}</View>
          <Text style={styles.hint}>고른 페이지를 PDF 한 파일로 만들어요.</Text>
        </>}

        {mode === 'range' && <>
          <Text style={toolPanelStyles.label}>페이지 범위</Text>
          <View style={styles.row}>
            <TextInput accessibilityLabel="시작 페이지" value={from} editable={!busy} keyboardType="number-pad" onChangeText={setFrom} style={styles.input} />
            <Text style={styles.hint}>쪽부터</Text>
            <TextInput accessibilityLabel="끝 페이지" value={to} editable={!busy} keyboardType="number-pad" onChangeText={setTo} style={styles.input} />
            <Text style={styles.hint}>쪽까지 · PDF 한 파일</Text>
          </View>
        </>}

        {mode === 'region' && <Text style={styles.hint}>페이지에서 원하는 구역만 PNG 로 내보내요. 자유 크기(기본 2배)나 피드·스토리 비율을 고를 수 있어요.{!onRegion ? ' 준비 중이에요.' : ''}</Text>}

        {!!invalid && mode !== 'region' && <Text accessibilityRole="alert" style={styles.hint}>{invalid}</Text>}
        {format === 'pdf' && mode !== 'region' && <Text style={styles.hint}>PDF는 이미지로 만든 문서라 글자를 검색하거나 선택할 수 없어요.</Text>}
        {job.status === 'error' && <Text accessibilityRole="alert" style={styles.hint}>{job.message} 파일은 저장되지 않았어요.</Text>}
        {job.status === 'cancelled' && <Text style={styles.hint}>PDF 생성을 취소했어요. 편집 내용은 그대로예요.</Text>}
        {format === 'pdf' && request.current && ['error', 'cancelled'].includes(job.status) && <ExportButton title="같은 내용으로 다시 만들기" onPress={() => run(true)} />}
        {mode === 'region'
          ? <ExportButton primary title="영역 고르기" onPress={onRegion} disabled={!onRegion} />
          : <ExportButton primary title={format === 'png' ? 'PNG 미리보기' : 'PDF 만들기'} onPress={() => run()} disabled={!!invalid || changed} />}
      </ScrollView>
    </View>
  </Modal>
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface }, // 둥글기·그림자는 공용 옵션 창(카드)을 따른다
  // 말풍선 꼬리: 카드 위쪽에서 내보내기 버튼 가운데를 가리킨다
  tail: { position: 'absolute', width: 16, height: 16, borderRadius: 3, backgroundColor: colors.surface, transform: [{ rotate: '45deg' }] },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  notice: { gap: 6 },
  // 옵션 창의 칩 버튼과 같은 모양
  button: { minHeight: 36, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#EEF2F9', borderWidth: 1.5, borderColor: 'transparent' },
  buttonText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  selected: { backgroundColor: colors.surface, borderColor: colors.primary },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  primary: { minHeight: 44, marginTop: 4, backgroundColor: colors.primary },
  primaryText: { fontSize: 14, fontWeight: '800', color: colors.surface },
  hint: { color: colors.textMuted, fontSize: 12.5, lineHeight: 19 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: 104, padding: 4, gap: 4, alignItems: 'center', borderRadius: 10, borderWidth: 1.5, borderColor: 'transparent', backgroundColor: '#EEF2F9' },
  tileOn: { borderColor: colors.primary, backgroundColor: colors.surface },
  tileThumb: { width: 96, overflow: 'hidden', borderRadius: 4 },
  tileText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  tileTextOn: { color: colors.primary },
  input: { width: 56, height: 38, borderWidth: 1, borderColor: colors.border, borderRadius: 10, textAlign: 'center', color: colors.text, fontSize: 14, fontWeight: '700' },
})
