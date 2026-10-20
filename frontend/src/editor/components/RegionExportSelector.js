import { useEffect, useRef, useState } from 'react'
import { Modal, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { colors } from '../../shared/theme'
import { PAGE_WIDTH, PAGE_HEIGHT } from '../constants'
import StaticPage from './canvas/StaticPage'
import RegionOverlay from './RegionOverlay'
import { ExportButton } from './ExportMenu'
import { validRegion } from '../utils/regionGeometry.js'

const pageSize = { width: PAGE_WIDTH, height: PAGE_HEIGHT }
export default function RegionExportSelector({ page, onCancel, onConfirm }) {
  const [region, setRegion] = useState({ x: 0, y: 0, ...pageSize })
  const [scale, setScale] = useState(1), [review, setReview] = useState(false), [drawing, setDrawing] = useState(false)
  const [panning, setPanning] = useState(true)
  const [fields, setFields] = useState(null), [fieldError, setFieldError] = useState('')
  const originalId = useRef(page.id)
  useEffect(() => { if (page.id !== originalId.current) onCancel() }, [page.id, onCancel])
  const { width, height } = useWindowDimensions()
  const zoom = Math.max(0.05, Math.min((width - 64) / PAGE_WIDTH, Math.max(180, height * 0.48) / PAGE_HEIGHT)) * scale
  const valid = validRegion(region, pageSize)
  const change = (next) => { setRegion(next); setReview(false) }
  const editFields = () => { setFieldError(''); setFields(Object.fromEntries(Object.entries(region).map(([k, v]) => [k, String(v)]))) }
  const applyFields = () => {
    const next = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.trim() === '' ? NaN : Number(v)]))
    if (!validRegion(next, pageSize)) { setFieldError('최소 32×32·페이지 경계를 확인해 주세요.'); return }
    change(next); setFields(null); setFieldError('')
  }
  return <Modal visible animationType="fade" onRequestClose={onCancel}><View style={styles.root}>
    <View style={styles.row}><Text style={styles.title}>내보낼 구역 선택</Text><ExportButton title="영역 선택 취소" onPress={onCancel} /></View>
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.hint}>화면 이동에서는 손가락으로 스크롤하세요. 새 영역 그리기로 범위를 정하고, 영역 조정에서 안쪽·모서리를 끌어 고치세요.</Text>
      <View style={styles.row}>
        <ExportButton title="영역 화면 축소" disabled={scale <= 0.5} onPress={() => setScale(Math.max(0.5, scale / 1.25))} />
        <Text style={styles.hint}>{Math.round(zoom * 100)}%</Text>
        <ExportButton title="영역 화면 확대" disabled={scale >= 4} onPress={() => setScale(Math.min(4, scale * 1.25))} />
        <ExportButton title="화면 이동" selected={panning} onPress={() => { setPanning(true); setDrawing(false) }} />
        <ExportButton title="영역 조정" selected={!panning && !drawing} onPress={() => { setPanning(false); setDrawing(false) }} />
        <ExportButton title="새 영역 그리기" selected={drawing} onPress={() => { setPanning(false); setDrawing(true) }} />
        <ExportButton title="영역 수치 조정" onPress={editFields} />
      </View>
      {fields && <View><View style={styles.row}>{Object.keys(fields).map((key) => <View key={key}>
        <Text style={styles.hint}>{{ x: '가로 위치', y: '세로 위치', width: '너비', height: '높이' }[key]}</Text>
        <TextInput accessibilityLabel={`영역 ${key}`} value={fields[key]} onChangeText={(v) => setFields({ ...fields, [key]: v })} keyboardType="decimal-pad" style={styles.input} />
      </View>)}</View><Text accessibilityRole="alert" style={styles.hint}>{fieldError}</Text><ExportButton title="영역 수치 적용" onPress={applyFields} /></View>}
      <ScrollView horizontal style={styles.stage} testID="region-horizontal-scroll"><View style={{ height: Math.min(height * 0.5, PAGE_HEIGHT * zoom + 48) }}><ScrollView testID="region-vertical-scroll"><View style={{ padding: 24 }}><View style={{ width: PAGE_WIDTH * zoom, height: PAGE_HEIGHT * zoom }}>
        <StaticPage page={page} zoom={zoom} still />
        <RegionOverlay key={`${page.id}-${zoom}`} region={region} onChange={change} drawing={drawing} panning={panning} onDrawEnd={() => setDrawing(false)} zoom={zoom} pageSize={pageSize} />
      </View></View></ScrollView></View></ScrollView>
      <Text accessibilityLiveRegion="polite" style={styles.hint}>선택 {region.width.toFixed(1)} × {region.height.toFixed(1)} · 위치 {region.x.toFixed(1)}, {region.y.toFixed(1)}</Text>
      {!valid && <Text accessibilityRole="alert" style={styles.hint}>가로·세로 32 이상으로 페이지 안에서 선택해 주세요.</Text>}
      <ExportButton title="선택 영역 확정" disabled={!valid} onPress={() => { setReview(true); onConfirm?.({ pageId: page.id, region: { ...region }, preset: 'free' }) }} />
      {review && <Text accessibilityLiveRegion="polite" style={styles.hint}>영역을 확정했어요. 영역 PNG 생성·저장 연결을 준비 중이며 아직 파일은 생성되지 않았어요. 선택을 조정하거나 취소할 수 있어요.</Text>}
    </ScrollView>
  </View></Modal>
}
const styles = StyleSheet.create({ root: { flex: 1, padding: 16, backgroundColor: colors.surface }, body: { paddingBottom: 24 }, row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, title: { flex: 1, fontSize: 20, fontWeight: '700', color: colors.text }, hint: { color: colors.textMuted, lineHeight: 21, paddingVertical: 6 }, stage: { backgroundColor: colors.surfaceSoft, borderRadius: 12 }, input: { minWidth: 80, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, color: colors.text } })
