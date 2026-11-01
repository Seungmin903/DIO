import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Defs, Image as SvgImage, Mask, Path, Pattern, Rect } from 'react-native-svg'
import EditorModal from '../controls/EditorModal'
import ConfirmDialog from '../controls/ConfirmDialog'
import Icon from '../controls/Icon'
import StickerSplitSlider from './StickerSplitSlider'
import { colors, radius, DISABLED_OPACITY } from '../../../shared/theme'
import { useSvgId } from '../../utils/svgId'
import { pickCutoutPhoto } from '../../services/stickerCutout'
import { CUTOUT_MAX_POINTS, CUTOUT_MAX_STROKES, containCutout, cutoutHistory, cutoutPath,
  cutoutPoint, emptyCutout, hasCutoutSelection, previewCutoutSelection } from '../../utils/stickerCutout'

function Action({ label, onPress, active, disabled, primary, variant = 'secondary', icon, iconOnly }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(active) }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.button, s[variant], active && s.active, primary && s.primary, (pressed || disabled) && s.dim]}>
    {icon && <Icon name={icon} size={18} forText={14} color={primary ? colors.surface : active ? colors.primaryStrong : colors.textMuted} />}
    {!iconOnly && <Text style={[s.buttonText, active && s.activeText, primary && s.primaryText]}>{label}</Text>}
  </Pressable>
}

export default function StickerCutoutModal({ folder, onClose, photoPicker = pickCutoutPhoto, preview = previewCutoutSelection }) {
  const { width, height } = useWindowDimensions()
  const wide = width >= 900
  const [source, setSource] = useState(null), sourceRef = useRef(null)
  const [history, setHistory] = useState(emptyCutout)
  const [mode, setMode] = useState('add'), [brushSize, setBrushSize] = useState(24)
  const [brushDraft, setBrushDraft] = useState(null), [sliding, setSliding] = useState(false)
  const shownBrushSize = brushDraft ?? brushSize
  const [draft, setDraft] = useState(null), gesture = useRef(null)
  const [area, setArea] = useState({ width: 0, height: 0 })
  const [phase, setPhase] = useState('select'), [busy, setBusy] = useState(false), locked = useRef(false)
  const [error, setError] = useState(''), [question, setQuestion] = useState(null), [saved, setSaved] = useState(false)
  const [ready, setReady] = useState(false)
  const alive = useRef(true), revision = useRef(0)
  const maskId = useSvgId('cutout-selection')
  const checkerId = useSvgId('cutout-checker')
  const rect = containCutout(source, area)
  const canPreview = ready && hasCutoutSelection(history)
  useEffect(() => { alive.current = true; return () => { alive.current = false; revision.current++; sourceRef.current?.dispose?.() } }, [])
  // 회전/크기 변경 중 끝나지 않은 획은 버린다. 확정된 정규화 좌표는 유지한다.
  useEffect(() => { gesture.current = null; setDraft(null) }, [width, height, area.width, area.height])
  const close = () => {
    if (locked.current) return
    if (history.strokes.length && !saved) setQuestion('close')
    else onClose()
  }
  const back = () => {
    if (locked.current) return
    if (phase === 'result') { setPhase('select'); setSaved(false); setError('') }
    else close()
  }
  const choose = async () => {
    if (locked.current) return
    locked.current = true; setBusy(true); setError('')
    const token = ++revision.current
    try {
      const next = await photoPicker()
      if (!alive.current || token !== revision.current) { next?.dispose?.(); return }
      if (!next) return
      const selected = { ...next, selectionKey: token }
      sourceRef.current?.dispose?.(); sourceRef.current = selected
      setSource(selected); setReady(false); setHistory(emptyCutout()); setSaved(false); setPhase('select')
    } catch (failure) { if (alive.current && token === revision.current) setError(failure.message || '사진을 열지 못했어요. 다시 선택해 주세요.') }
    finally { if (alive.current && token === revision.current) { locked.current = false; setBusy(false) } }
  }
  const analyze = async () => {
    if (locked.current || !canPreview) return
    locked.current = true; setBusy(true); setError('')
    const token = ++revision.current
    try {
      await preview(source, history)
      if (alive.current && token === revision.current) { setPhase('result'); setSaved(false) }
    } catch (failure) { if (alive.current && token === revision.current) setError(failure.message || '미리보기를 열지 못했어요. 다시 시도해 주세요.') }
    finally { if (alive.current && token === revision.current) { locked.current = false; setBusy(false) } }
  }
  const endStroke = cancelled => {
    const stroke = gesture.current; gesture.current = null; setDraft(null)
    if (!cancelled && stroke) setHistory(value => cutoutHistory(value, { type: 'stroke', stroke }))
  }
  const startStroke = event => {
    if (!ready || busy || phase !== 'select' || history.strokes.length >= CUTOUT_MAX_STROKES || !rect || (event.nativeEvent.touches?.length || 0) > 1) return
    const point = cutoutPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, rect)
    if (!point) return
    gesture.current = { mode, width: Math.min(1, brushSize / rect.width), points: [point] }
    setDraft({ ...gesture.current })
  }
  const moveStroke = event => {
    if (!gesture.current) return
    if ((event.nativeEvent.touches?.length || 0) > 1) { endStroke(true); return }
    const point = cutoutPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, rect)
    if (!point || gesture.current.points.length >= CUTOUT_MAX_POINTS) return
    gesture.current.points.push(point)
    setDraft({ ...gesture.current, points: [...gesture.current.points] })
  }
  const paths = [...history.strokes, ...(draft ? [draft] : [])]
  return <EditorModal visible transparent animationType="none" onRequestClose={back}>
    <SafeAreaView style={s.backdrop}>
      <View style={s.card}>
        <View style={s.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="스티커 만들기 뒤로" disabled={busy} style={s.icon} onPress={back}><Icon name="chevronLeft" size={20} /></Pressable>
          <Text accessibilityRole="header" style={s.title}>사진 속 대상 오리기</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="스티커 만들기 닫기" disabled={busy} style={s.icon} onPress={close}><Icon name="close" size={20} /></Pressable>
        </View>
        <ScrollView scrollEnabled={!sliding} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
          <Text style={s.notice}>화면 미리보기 · AI 분리와 실제 저장은 아직 연결되지 않았어요.</Text>
          <View style={s.steps} accessibilityLabel={phase === 'select' ? '1단계 대상 선택' : '2단계 스티커 확인'}>
            <Text style={[s.step, phase === 'select' && s.currentStep]}>1 대상 선택</Text>
            <Icon name="chevronRight" size={16} />
            <Text style={[s.step, phase === 'result' && s.currentStep]}>2 스티커 확인</Text>
          </View>
          {source && <Text style={s.muted}>{phase === 'select'
            ? '스티커로 만들 대상을 칠해 주세요.'
            : '결과를 확인하고, 고칠 곳이 있으면 선택 수정으로 돌아가세요.'}</Text>}
          <View style={[s.layout, source && wide && s.wide]}>
            <View style={s.imageColumn}>
              <View testID="cutout-viewport" style={[s.canvas, { height: Math.max(180, Math.min(wide ? 440 : 340, height * .48)) }]}
                onLayout={event => setArea(event.nativeEvent.layout)}>
                {!source && <Pressable accessibilityRole="button" accessibilityLabel="사진 선택"
                  accessibilityState={{ disabled: busy }} disabled={busy} onPress={choose}
                  style={({ pressed }) => [s.empty, (pressed || busy) && s.dim]}>
                  <Icon name="image" size={40} />
                  <Text style={s.buttonText}>사진 선택</Text>
                  <Text style={s.muted}>스티커로 만들 사진을 골라 주세요.</Text>
                </Pressable>}
                {source && rect && <View accessibilityLabel="스티커 대상 칠하기 영역" testID="cutout-canvas"
                  style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height, touchAction: 'none' }}
                  onStartShouldSetResponder={() => ready && !busy && phase === 'select'}
                  onMoveShouldSetResponder={() => ready && !busy && phase === 'select'}
                  onResponderGrant={startStroke} onResponderMove={moveStroke}
                  onResponderRelease={() => endStroke(false)} onResponderTerminate={() => endStroke(true)}
                  onResponderTerminationRequest={() => false}>
                  {phase === 'select' ? <>
                    <Image key={source.selectionKey} pointerEvents="none" source={{ uri: source.uri }} style={StyleSheet.absoluteFill}
                      resizeMode="contain" onLoad={() => { if (sourceRef.current === source) setReady(true) }} onError={() => {
                        if (sourceRef.current !== source) return
                        setReady(false); setError('사진을 표시하지 못했어요. 다른 사진을 선택해 주세요.')
                      }} />
                    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox={`0 0 ${source.width} ${source.height}`}>
                      {paths.map((stroke, index) => <Path key={index} d={cutoutPath(stroke, source)} fill="none"
                        stroke={stroke.mode === 'add' ? colors.primaryStrong : colors.danger} opacity={.55}
                        strokeWidth={stroke.width * source.width} strokeLinecap="round" strokeLinejoin="round" />)}
                    </Svg>
                  </> : <Svg pointerEvents="none" width="100%" height="100%" viewBox={`0 0 ${source.width} ${source.height}`}>
                    <Defs>
                      <Pattern id={checkerId} width="24" height="24" patternUnits="userSpaceOnUse">
                        <Rect width="24" height="24" fill={colors.surface} />
                        <Rect width="12" height="12" fill={colors.border} />
                        <Rect x="12" y="12" width="12" height="12" fill={colors.border} />
                      </Pattern>
                      <Mask id={maskId} x="0" y="0" width={source.width} height={source.height} maskUnits="userSpaceOnUse" maskType="luminance">
                      <Rect width={source.width} height={source.height} fill="black" />
                      {history.strokes.map((stroke, index) => <Path key={index} d={cutoutPath(stroke, source)} fill="none"
                        stroke={stroke.mode === 'add' ? 'white' : 'black'} strokeWidth={stroke.width * source.width} strokeLinecap="round" strokeLinejoin="round" />)}
                    </Mask></Defs>
                    <Rect width={source.width} height={source.height} fill={`url(#${checkerId})`} />
                    <SvgImage href={{ uri: source.uri }} width={source.width} height={source.height} mask={`url(#${maskId})`} />
                  </Svg>}
                </View>}
              </View>
              {source && <Text style={s.muted}>{phase === 'result'
                ? '지금은 붓질한 부분만 보여주는 예시예요. AI 윤곽·흰 테두리는 아직 적용되지 않았어요.'
                : '파란색은 남길 대상의 힌트, 빨간색은 지울 영역이에요. 현재는 붓질만 표시돼요.'}</Text>}
            </View>
            <View style={[s.controls, source && wide && s.wideControls]}>
              {phase === 'select' ? <>
                {source && <>
                  <Action label="다른 사진 선택" variant="quiet" icon="image" disabled={busy} onPress={choose} />
                  <View style={s.toolSection}>
                  <Text style={s.label}>대상 선택</Text>
                  <View style={s.segmentRow}><Action label="선택 추가" variant="segment" icon="pen" active={mode === 'add'} disabled={busy || !ready} onPress={() => setMode('add')} />
                    <Action label="선택 제외" variant="segment" icon="eraser" active={mode === 'exclude'} disabled={busy || !ready} onPress={() => setMode('exclude')} /></View>
                  <View style={s.sizeHeader}>
                    <Text style={s.label}>붓 크기</Text>
                    <View style={s.spacer} />
                    <Text style={s.label}>{shownBrushSize}</Text>
                  </View>
                  <StickerSplitSlider label="붓 크기" min={6} max={80} step={1} value={shownBrushSize} disabled={busy || !ready}
                    onPreview={setBrushDraft} onCommit={value => { setBrushSize(value); setBrushDraft(null) }}
                    onCancel={() => setBrushDraft(null)} onInteraction={setSliding} />
                  <View style={s.historyRow}><Action label="되돌리기" variant="history" icon="undo" iconOnly disabled={busy || !history.strokes.length} onPress={() => setHistory(value => cutoutHistory(value, { type: 'undo' }))} />
                    <Action label="다시 실행" variant="history" icon="redo" iconOnly disabled={busy || !history.redo.length} onPress={() => setHistory(value => cutoutHistory(value, { type: 'redo' }))} />
                    <View style={s.spacer} />
                    <Action label="선택 초기화" variant="quiet" icon="reset" disabled={busy || !history.strokes.length} onPress={() => setQuestion('reset')} /></View>
                  </View>
                  {history.strokes.length >= CUTOUT_MAX_STROKES && <Text style={s.muted}>선택 획이 많아요. 되돌리거나 초기화해 주세요.</Text>}
                  <Action label="다음 · 스티커 확인" primary disabled={busy || !canPreview} onPress={analyze} />
                </>}
              </> : <>
                <Text style={s.label}>스티커 확인 · 예시</Text>
                <Text style={s.muted}>저장할 폴더: {folder?.name || '내 스티커'}</Text>
                <Action label="선택 수정" icon="pen" disabled={busy} onPress={back} />
                <Action label="저장 흐름 확인" primary disabled={busy || saved} onPress={() => setQuestion('save')} />
                {saved && <Text accessibilityLiveRegion="polite" style={s.notice}>저장 화면 확인을 마쳤어요. 실제 파일과 스티커는 추가되지 않았어요.</Text>}
              </>}
              {busy && <ActivityIndicator accessibilityLabel="스티커 미리보기 처리 중" color={colors.primaryStrong} />}
              {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
            </View>
          </View>
        </ScrollView>
      </View>
      <ConfirmDialog open={Boolean(question)} title={question === 'save' ? '저장 흐름을 확인할까요?' : question === 'reset' ? '선택을 모두 지울까요?' : '스티커 만들기를 닫을까요?'}
        message={question === 'save' ? '목업 확인이에요. 실제 스티커는 저장되지 않아요.' : question === 'reset' ? '칠한 영역을 처음부터 다시 선택해요.' : '칠한 영역은 저장되지 않아요.'}
        confirmLabel={question === 'save' ? '확인' : question === 'reset' ? '초기화' : '닫기'} danger={question !== 'save'}
        onCancel={() => setQuestion(null)} onConfirm={() => {
          const kind = question; setQuestion(null)
          if (kind === 'save') setSaved(true)
          else if (kind === 'reset') setHistory(emptyCutout())
          else onClose()
        }} />
    </SafeAreaView>
  </EditorModal>
}

const s = StyleSheet.create({
  // 창 전체를 덮는다(좌우·상하 끝까지). 안전 영역은 SafeAreaView 가 비우고 같은 바탕색으로 칠한다.
  backdrop: { flex: 1, backgroundColor: colors.surface },
  card: { flex: 1, width: '100%', backgroundColor: colors.surface, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 8, gap: 4, borderBottomWidth: 1, borderColor: colors.border },
  title: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '800' }, icon: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 16 }, notice: { color: colors.text, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 12, fontSize: 12, lineHeight: 18 },
  steps: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { color: colors.textMuted, fontSize: 12 }, currentStep: { color: colors.primaryStrong, fontWeight: '700' },
  layout: { gap: 16 }, wide: { flexDirection: 'row', alignItems: 'flex-start' }, imageColumn: { flex: 1, gap: 8, minWidth: 0 },
  canvas: { width: '100%', backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  controls: { gap: 10 }, wideControls: { width: 280 }, row: { flexDirection: 'row', gap: 8 },
  toolSection: { gap: 12, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  segmentRow: { flexDirection: 'row', gap: 3, padding: 3, backgroundColor: colors.surfaceMuted, borderRadius: 11 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 }, spacer: { flex: 1 },
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: colors.surfaceMuted }, quiet: { backgroundColor: 'transparent' },
  segment: { flex: 1, borderRadius: radius.sm },
  sizeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  history: { width: 44, paddingHorizontal: 0 },
  buttonText: { color: colors.text, fontSize: 13, fontWeight: '700' }, primary: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  primaryText: { color: colors.surface }, active: { borderColor: colors.primary, backgroundColor: colors.surface }, activeText: { color: colors.primaryStrong, fontWeight: '800' }, dim: { opacity: DISABLED_OPACITY },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700' }, muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18 }, error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
})
