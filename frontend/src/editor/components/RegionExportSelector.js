import { useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { colors } from '../../shared/theme'
import { pageSize as readPageSize } from '../utils/pageGeometry.js'
import StaticPage from './canvas/StaticPage'
import RegionOverlay from './RegionOverlay'
import ExportScreen, { ExportButton, InfoRow, Note } from './ExportScreen'
import { toolPanelStyles } from './ToolPanel'
import { REGION_PRESETS, fitRegionPreset, regionOutput, regionPublishWarning, validRegion } from '../utils/regionGeometry.js'
export default function RegionExportSelector({
  page,
  onCancel,
  onConfirm,
  visible = true
}) {
  const pageSize = readPageSize(page)
  const { width: PAGE_WIDTH, height: PAGE_HEIGHT } = pageSize
  const [region, setRegion] = useState({
      x: 0,
      y: 0,
      ...pageSize
    }),
    [preset, setPreset] = useState('free')
  const [scale, setScale] = useState(1),
    [confirmed, setConfirmed] = useState(false),
    [drawing, setDrawing] = useState(false)
  const [panning, setPanning] = useState(true)
  const [confirmError, setConfirmError] = useState('')
  const [fields, setFields] = useState(null),
    [fieldError, setFieldError] = useState(''),
    [destination, setDestination] = useState('feed')
  const originalId = useRef(page.id)
  useEffect(() => {
    if (page.id !== originalId.current) onCancel()
  }, [page.id, onCancel])
  const {
    width,
    height
  } = useWindowDimensions()
  // 작업 영역(오른쪽 옵션 카드를 뺀 자리)에 페이지가 들어가는 배율
  const wide = width >= 720
  // 바깥 여백(16×2)·옵션 카드(320)+간격(16)·작업 영역 안쪽 여백(16×2)·스크롤 여백(8×2) 을 뺀 자리
  const stageWidth = width - 32 - (wide ? 336 : 0) - 48, stageHeight = (wide ? height - 64 - 32 : height * 0.5) - 48
  const zoom = Math.max(0.05, Math.min(stageWidth / PAGE_WIDTH, Math.max(160, stageHeight) / PAGE_HEIGHT)) * scale
  const ratio = REGION_PRESETS[preset].ratio
  const output = region.width > 0 && region.height > 0 ? regionOutput(region, preset) : {
    width: 0,
    height: 0,
    magnification: 0,
    blocked: false,
    needsConfirmation: false
  }
  const valid = validRegion(region, pageSize, ratio)
  const change = next => {
    setRegion(next)
    setConfirmed(false)
    setConfirmError('')
  }
  const switchPreset = id => {
    const next = fitRegionPreset(region, id, pageSize)
    if (next) {
      setPreset(id)
      change(next)
      setFields(null)
    }
  }
  const ratioWarning = preset === 'free' && regionPublishWarning(region, destination)
  const editFields = () => {
    setFieldError('')
    setFields(Object.fromEntries(Object.entries(region).map(([k, v]) => [k, String(v)])))
  }
  const applyFields = () => {
    const next = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.trim() === '' ? NaN : Number(v)]))
    if (!validRegion(next, pageSize, ratio)) {
      setFieldError('최소 32×32·페이지 경계·프리셋 비율을 확인해 주세요.')
      return
    }
    change(next)
    setFields(null)
    setFieldError('')
  }
  const mode = drawing ? 'draw' : panning ? 'pan' : 'adjust'
  const setMode = (next) => { setPanning(next === 'pan'); setDrawing(next === 'draw') }
  return <ExportScreen visible={visible} title="내보낼 영역 선택" onClose={onCancel} closeLabel="영역 선택 취소"
    preview={<ScrollView horizontal style={styles.scroll} contentContainerStyle={styles.scrollContent} testID="region-horizontal-scroll">
      <ScrollView testID="region-vertical-scroll" contentContainerStyle={styles.scrollContent}>
        <View style={[styles.page, { width: PAGE_WIDTH * zoom, height: PAGE_HEIGHT * zoom }]}>
          <StaticPage page={page} zoom={zoom} still />
          <RegionOverlay key={`${page.id}-${zoom}-${preset}`} region={region} onChange={change} drawing={drawing} panning={panning} onDrawEnd={() => setDrawing(false)} zoom={zoom} pageSize={pageSize} ratio={ratio} />
        </View>
      </ScrollView>
    </ScrollView>}>
    <Text style={toolPanelStyles.label}>비율</Text>
    <View style={styles.row}>{Object.entries(REGION_PRESETS).map(([id, config]) => <ExportButton key={id} title={config.label} selected={preset === id} disabled={!fitRegionPreset(region, id, pageSize)} onPress={() => switchPreset(id)} />)}</View>
    <Text style={toolPanelStyles.label}>손가락으로</Text>
    <View style={styles.row}>
      <ExportButton title="화면 이동" selected={mode === 'pan'} onPress={() => setMode('pan')} />
      <ExportButton title="영역 조정" selected={mode === 'adjust'} onPress={() => setMode('adjust')} />
      <ExportButton title="새 영역 그리기" selected={mode === 'draw'} onPress={() => setMode('draw')} />
    </View>
    <View style={styles.row}>
      <ExportButton title="영역 화면 축소" label="−" disabled={scale <= 0.5} onPress={() => setScale(Math.max(0.5, scale / 1.25))} />
      <Text style={styles.zoom}>{Math.round(zoom * 100)}%</Text>
      <ExportButton title="영역 화면 확대" label="+" disabled={scale >= 4} onPress={() => setScale(Math.min(4, scale * 1.25))} />
      <ExportButton title="영역 수치 조정" label="수치 입력" selected={!!fields} onPress={fields ? () => setFields(null) : editFields} />
    </View>
    {fields && <View style={styles.fields}>
      <View style={styles.row}>{Object.keys(fields).map(key => <View key={key} style={styles.field}><Text style={styles.fieldLabel}>{{ x: '가로 위치', y: '세로 위치', width: '너비', height: '높이' }[key]}</Text>
        <TextInput accessibilityLabel={`영역 ${key}`} value={fields[key]} onChangeText={v => setFields({ ...fields, [key]: v })} keyboardType="decimal-pad" style={styles.input} /></View>)}</View>
      {!!fieldError && <Note tone="alert">{fieldError}</Note>}
      <ExportButton title="영역 수치 적용" label="적용" onPress={applyFields} />
    </View>}
    <InfoRow label="선택" value={`${region.width.toFixed(0)} × ${region.height.toFixed(0)}`} />
    <InfoRow label="예상 PNG" value={`${output.width} × ${output.height}px · ${output.magnification.toFixed(2)}배`} />
    {!valid && <Note tone="alert">가로·세로 32 이상으로 페이지 안에서 선택해 주세요.</Note>}
    {preset === 'free' && <View style={styles.row}><ExportButton title="피드 비율 안내" label="피드" selected={destination === 'feed'} onPress={() => setDestination('feed')} /><ExportButton title="스토리 비율 안내" label="스토리" selected={destination === 'story'} onPress={() => setDestination('story')} /></View>}
    {ratioWarning && <Note>{destination === 'feed' ? '피드 기본 권장 비율 밖이에요. 게시하면 잘릴 수 있어요.' : '스토리 권장 비율 9:16과 달라 잘리거나 여백이 생길 수 있어요.'} 그대로 고를 수 있어요.</Note>}
    {output.blocked && <Note tone="alert">확대가 6배를 넘어요. 더 넓게 고르거나 자유 비율로 바꿔 주세요.</Note>}
    {output.needsConfirmation && <><Note>3배를 넘게 확대하면 사진·글씨가 흐릴 수 있어요.</Note><ExportButton title="화질 안내 확인 후 계속" label="확인했어요" selected={confirmed} onPress={() => setConfirmed(true)} /></>}
    <ExportButton primary title="선택 영역 확정" label="이 영역으로 PNG 만들기" disabled={!valid || output.blocked || output.needsConfirmation && !confirmed} onPress={() => {
      try { onConfirm?.({ pageId: page.id, region: { ...region }, preset, output, upscaleConfirmed: confirmed }); setConfirmError('') } catch (error) { setConfirmError(error.message || '선택 영역을 확인한 뒤 다시 시도해 주세요.') }
    }} />
    {!!confirmError && <Note tone="alert">{confirmError}</Note>}
  </ExportScreen>
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  scroll: { alignSelf: 'stretch', flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  page: { borderRadius: 4, overflow: 'hidden', backgroundColor: colors.surface, boxShadow: '0px 8px 20px rgba(28, 28, 28, 0.07)' },
  zoom: { minWidth: 48, textAlign: 'center', fontSize: 12.5, fontWeight: '700', color: colors.text },
  fields: { gap: 8 },
  field: { gap: 4 },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: colors.textMuted },
  input: { width: 64, height: 38, borderWidth: 1, borderColor: colors.border, borderRadius: 10, textAlign: 'center', color: colors.text, fontSize: 13, fontWeight: '700' },
})
