import { useEffect, useRef, useState } from 'react'
import { Modal, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { colors } from '../../shared/theme'
import { pageSize as readPageSize } from '../utils/pageGeometry.js'
import StaticPage from './canvas/StaticPage'
import RegionOverlay from './RegionOverlay'
import { ExportButton } from './ExportMenu'
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
  const zoom = Math.max(0.05, Math.min((width - 64) / PAGE_WIDTH, Math.max(180, height * 0.48) / PAGE_HEIGHT)) * scale
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
  return <Modal visible={visible} animationType="fade" onRequestClose={onCancel}><View style={styles.root}>
    <View style={styles.row}><Text style={styles.title}>내보낼 구역 선택</Text><ExportButton title="영역 선택 취소" onPress={onCancel} /></View>
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.hint}>화면 이동에서는 손가락으로 스크롤하세요. 새 영역 그리기로 범위를 정하고, 영역 조정에서 안쪽·모서리를 끌어 고치세요.</Text>
      <View style={styles.row}>{Object.entries(REGION_PRESETS).map(([id, config]) => <ExportButton key={id} title={config.label} selected={preset === id} disabled={!fitRegionPreset(region, id, pageSize)} onPress={() => switchPreset(id)} />)}</View>
      <View style={styles.row}><ExportButton title="영역 화면 축소" disabled={scale <= 0.5} onPress={() => setScale(Math.max(0.5, scale / 1.25))} /><Text style={styles.hint}>{Math.round(zoom * 100)}%</Text><ExportButton title="영역 화면 확대" disabled={scale >= 4} onPress={() => setScale(Math.min(4, scale * 1.25))} /><ExportButton title="화면 이동" selected={panning} onPress={() => {
            setPanning(true)
            setDrawing(false)
          }} />
      <ExportButton title="영역 조정" selected={!panning && !drawing} onPress={() => {
            setPanning(false)
            setDrawing(false)
          }} />
      <ExportButton title="새 영역 그리기" selected={drawing} onPress={() => {
            setPanning(false)
            setDrawing(true)
          }} /><ExportButton title="영역 수치 조정" onPress={editFields} /></View>
      {fields && <View><View style={styles.row}>{Object.keys(fields).map(key => <View key={key}><Text style={styles.hint}>{{
                  x: '가로 위치',
                  y: '세로 위치',
                  width: '너비',
                  height: '높이'
                }[key]}</Text><TextInput accessibilityLabel={`영역 ${key}`} value={fields[key]} onChangeText={v => setFields({
                ...fields,
                [key]: v
              })} keyboardType="decimal-pad" style={styles.input} /></View>)}</View><Text accessibilityRole="alert" style={styles.hint}>{fieldError}</Text><ExportButton title="영역 수치 적용" onPress={applyFields} /></View>}
      <ScrollView horizontal style={styles.stage} testID="region-horizontal-scroll"><View style={{
            height: Math.min(height * 0.5, PAGE_HEIGHT * zoom + 48)
          }}><ScrollView testID="region-vertical-scroll"><View style={{
                padding: 24
              }}><View style={{
                  width: PAGE_WIDTH * zoom,
                  height: PAGE_HEIGHT * zoom
                }}>
        <StaticPage page={page} zoom={zoom} still />
        <RegionOverlay key={`${page.id}-${zoom}-${preset}`} region={region} onChange={change} drawing={drawing} panning={panning} onDrawEnd={() => setDrawing(false)} zoom={zoom} pageSize={pageSize} ratio={ratio} />
      </View></View></ScrollView></View></ScrollView>
      <Text accessibilityLiveRegion="polite" style={styles.hint}>선택 {region.width.toFixed(1)} × {region.height.toFixed(1)} · 예상 PNG {output.width} × {output.height}px · 확대 {output.magnification.toFixed(2)}배</Text>
      {!valid && <Text accessibilityRole="alert" style={styles.hint}>가로·세로 32 이상으로 페이지 안에서 선택해 주세요.</Text>}
      {preset === 'free' && <View style={styles.row}><ExportButton title="피드 비율 안내" selected={destination === 'feed'} onPress={() => setDestination('feed')} /><ExportButton title="스토리 비율 안내" selected={destination === 'story'} onPress={() => setDestination('story')} /></View>}
      {ratioWarning && <Text style={styles.hint}>{destination === 'feed' ? '피드 기본 권장 비율 밖입니다. 게시 시 잘릴 수 있어요.' : '스토리 권장 비율 9:16과 달라 잘리거나 여백이 생길 수 있어요.'} 그대로 선택할 수 있어요.</Text>}
      {output.blocked && <Text accessibilityRole="alert" style={styles.hint}>확대가 6배를 넘어요. 더 넓게 선택하거나 자유 비율로 전환해 주세요.</Text>}
      {output.needsConfirmation && <View><Text style={styles.hint}>3배를 넘게 확대하면 사진·글씨가 흐릴 수 있어요.</Text><ExportButton title="화질 안내 확인 후 계속" selected={confirmed} onPress={() => setConfirmed(true)} /></View>}
      <ExportButton title="선택 영역 확정" disabled={!valid || output.blocked || output.needsConfirmation && !confirmed} onPress={() => {
          try { onConfirm?.({
            pageId: page.id,
            region: {
              ...region
            },
            preset,
            output,
            upscaleConfirmed: confirmed
          }); setConfirmError('') } catch (error) { setConfirmError(error.message || '선택 영역을 확인한 뒤 다시 시도해 주세요.') }
        }} />
      {!!confirmError && <Text accessibilityRole="alert" style={styles.hint}>{confirmError}</Text>}
    </ScrollView>
  </View></Modal>
}
const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.surface
  },
  body: {
    paddingBottom: 24
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text
  },
  hint: {
    color: colors.textMuted,
    lineHeight: 21,
    paddingVertical: 6
  },
  stage: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: 12
  },
  input: {
    minWidth: 80,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 8,
    color: colors.text
  }
})
