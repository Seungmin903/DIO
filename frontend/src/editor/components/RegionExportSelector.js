import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { pageSize as readPageSize } from '../utils/pageGeometry.js'
import RegionViewport from './RegionViewport'
import ExportScreen, { ExportButton, InfoRow, Note } from './ExportScreen'
import { toolPanelStyles } from './ToolPanel'
import { REGION_PRESETS, fitRegionPreset, regionOutput, validRegion } from '../utils/regionGeometry.js'

export default function RegionExportSelector({
  page,
  onCancel,
  onConfirm,
  visible = true
}) {
  const pageSize = readPageSize(page)
  const [region, setRegion] = useState({
      x: 0,
      y: 0,
      ...pageSize
    }),
    [preset, setPreset] = useState('free')
  const [confirmed, setConfirmed] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [draft, setDraft] = useState(null)
  const originalId = useRef(page.id)
  useEffect(() => {
    if (page.id !== originalId.current) onCancel()
  }, [page.id, onCancel])
  const ratio = REGION_PRESETS[preset].ratio
  const selection = draft ?? region
  const output = selection.width > 0 && selection.height > 0 ? regionOutput(selection, preset) : {
    width: 0,
    height: 0,
    magnification: 0,
    blocked: false,
    needsConfirmation: false
  }
  const valid = validRegion(selection, pageSize, ratio)
  const change = next => {
    setRegion(next)
    setDraft(null)
    setConfirmed(false)
    setConfirmError('')
  }
  const switchPreset = id => {
    const next = fitRegionPreset(region, id, pageSize)
    if (next) {
      setPreset(id)
      change(next)
    }
  }
  return <ExportScreen visible={visible} stablePreview title="내보낼 영역 선택" onClose={onCancel} closeLabel="영역 선택 취소"
    preview={<RegionViewport page={page} pageSize={pageSize} region={region} draft={draft} ratio={ratio} onDraft={setDraft} onChange={change} />}>
    <Text style={toolPanelStyles.label}>비율</Text>
    <View style={styles.row}>{Object.entries(REGION_PRESETS).map(([id, config]) => <ExportButton key={id} title={config.label} selected={preset === id} disabled={!fitRegionPreset(region, id, pageSize)} onPress={() => switchPreset(id)} />)}</View>
    <InfoRow label="선택" value={`${selection.width.toFixed(0)} × ${selection.height.toFixed(0)}`} />
    <InfoRow label="예상 PNG" value={`${output.width} × ${output.height}px · ${output.magnification.toFixed(2)}배`} />
    {!valid && <Note tone="alert">가로·세로 32 이상으로 페이지 안에서 선택해 주세요.</Note>}
    {output.blocked && <Note tone="alert">확대가 6배를 넘어요. 더 넓게 고르거나 자유 비율로 바꿔 주세요.</Note>}
    {output.needsConfirmation && <><Note>3배를 넘게 확대하면 사진·글씨가 흐릴 수 있어요.</Note><ExportButton title="화질 안내 확인 후 계속" label="확인했어요" selected={confirmed} onPress={() => setConfirmed(true)} /></>}
    <ExportButton primary title="선택 영역 확정" label="이 영역으로 PNG 만들기" disabled={!!draft || !valid || output.blocked || output.needsConfirmation && !confirmed} onPress={() => {
      try { onConfirm?.({ pageId: page.id, region: { ...region }, preset, output, upscaleConfirmed: confirmed }) } catch (error) { setConfirmError(error.message || '선택 영역을 확인한 뒤 다시 시도해 주세요.') }
    }} />
    {!!confirmError && <Note tone="alert">{confirmError}</Note>}
  </ExportScreen>
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
})
