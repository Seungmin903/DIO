import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Defs, Image as SvgImage, Mask, Path, Pattern, Rect } from 'react-native-svg'
import EditorModal from '../controls/EditorModal'
import ConfirmDialog from '../controls/ConfirmDialog'
import StickerSplitSlider from './StickerSplitSlider'
import PenSafeTextInput from '../controls/PenSafeTextInput'
import DioButton from '../../../shared/DioButton'
import { MakerBar, MakerEmpty, MakerHeader, MakerNav, MakerSegment, MakerSegmentItem, MakerStage, MakerSteps } from '../../../shared/MakerKit'
import { colors, radius } from '../../../shared/theme'
import { useSvgId } from '../../utils/svgId'
import { pickCutoutPhoto } from '../../services/stickerCutout'
import { CUTOUT_MAX_POINTS, CUTOUT_MAX_STROKES, containCutout, cutoutHistory, cutoutPath,
  cutoutPoint, emptyCutout, hasCutoutSelection, previewCutoutSelection } from '../../utils/stickerCutout'

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
  // 폴더 이름은 마지막(스티커 확인)에서 정한다. 이미 연 폴더에 넣을 때는 이름만 보인다
  const [name, setName] = useState(folder?.name ?? '내 스티커')
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
  // 이전 단계(② → ①): 하단 `이전` · 단계 표시의 지난 단계 · 기기 뒤로가기. ① 의 기기 뒤로가기는 나가기와 같다. 헤더 왼쪽 < 는 늘 나가기
  const back = () => {
    if (locked.current) return
    if (phase === 'result') { setPhase('select'); setSaved(false); setError('') }
    else close()
  }
  // 칠한 영역이 있으면 이미지를 바꾸기 전에 묻는다(시트 분리와 같은 규칙)
  const requestImage = () => {
    if (locked.current) return
    if (history.strokes.length) setQuestion('image')
    else choose()
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
  const steps = [{ id: 'select', label: '대상 고르기' }, { id: 'result', label: '스티커 확인' }]
  // 가로(폭 900 이상)는 시트 분리처럼 오른쪽 도구 단(32%, 340~420) 맨 아래에 단계 버튼을 고정한다. 세로 · 폰은 하단 바
  const sideWidth = Math.round(Math.min(420, Math.max(340, width * .32)))
  const stageHeight = Math.max(240, Math.min(width < 600 ? 360 : 480, height * .5))
  const picture = source && rect && <View accessibilityLabel="스티커 대상 칠하기 영역" testID="cutout-canvas"
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
  </View>
  const stepView = <MakerSteps steps={steps} current={phase} onStep={back} disabled={busy} label={phase === 'select' ? '1단계 대상 고르기' : '2단계 스티커 확인'} />
  // ① 대상 고르기 도구 · ② 폴더 이름. ② 에는 ① 의 도구를 다시 띄우지 않는다(돌아갈 땐 헤더 뒤로)
  const tools = phase === 'select' ? <>
    <DioButton variant="tonal" icon="image" label="이미지 바꾸기" disabled={busy} onPress={requestImage} />
    <View style={s.toolSection}>
      <Text accessibilityRole="header" style={s.heading}>대상 고르기</Text>
      <MakerSegment label="대상 고르기">
        <MakerSegmentItem label="선택 추가" icon="pen" on={mode === 'add'} disabled={busy || !ready} onPress={() => setMode('add')} />
        <MakerSegmentItem label="선택 제외" icon="eraser" on={mode === 'exclude'} disabled={busy || !ready} onPress={() => setMode('exclude')} />
      </MakerSegment>
      <View style={s.sizeHeader}>
        <Text style={s.heading}>브러시 크기</Text>
        <View style={s.spacer} />
        <Text style={s.value}>{shownBrushSize}</Text>
      </View>
      <StickerSplitSlider label="브러시 크기" min={6} max={80} step={1} value={shownBrushSize} disabled={busy || !ready}
        onPreview={setBrushDraft} onCommit={value => { setBrushSize(value); setBrushDraft(null) }}
        onCancel={() => setBrushDraft(null)} onInteraction={setSliding} />
      <View style={s.historyRow}>
        <DioButton variant="icon" icon="undo" label="되돌리기" disabled={busy || !history.strokes.length} onPress={() => setHistory(value => cutoutHistory(value, { type: 'undo' }))} />
        <DioButton variant="icon" icon="redo" label="다시 실행" disabled={busy || !history.redo.length} onPress={() => setHistory(value => cutoutHistory(value, { type: 'redo' }))} />
        <View style={s.spacer} />
        <DioButton variant="ghost" outline icon="reset" label="선택 초기화" disabled={busy || !history.strokes.length} onPress={() => setQuestion('reset')} />
      </View>
    </View>
    {history.strokes.length >= CUTOUT_MAX_STROKES && <Text style={s.hint}>선택 획이 많아요. 되돌리거나 초기화해 주세요.</Text>}
  </> : <View style={s.toolSection}>
    <Text accessibilityRole="header" style={s.heading}>폴더 이름</Text>
    {folder ? <Text numberOfLines={1} style={s.folder}>{folder.name}</Text>
      : <PenSafeTextInput value={name} editable={!busy && !saved} onChangeText={setName} maxLength={12} placeholder="폴더 이름" placeholderTextColor={colors.textMuted} accessibilityLabel="스티커 폴더 이름" style={s.input} />}
  </View>
  const status = (busy || !!error) ? <>
    {busy && <ActivityIndicator accessibilityLabel="스티커 미리보기 처리 중" color={colors.primaryStrong} />}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </> : null
  const action = phase === 'select'
    ? <MakerNav><DioButton variant="filled" label="다음 · 스티커 확인" text="다음" block disabled={busy || !canPreview} onPress={analyze} /></MakerNav>
    : <MakerNav onPrev={back} prevDisabled={busy}><DioButton variant="filled" label="저장 흐름 확인" text="1개 저장" block disabled={busy || saved || !name.trim()} onPress={() => setQuestion('save')} /></MakerNav>
  // 가로는 왼쪽 단 높이를 끝까지 채운다(아래가 비지 않게). 세로 · 폰은 도구가 아래에 쌓이므로 높이를 정한다
  const stage = <MakerStage testID="cutout-viewport" style={source && !wide ? { height: stageHeight } : s.emptyStage} onLayout={event => setArea(event.nativeEvent.layout)}>
    {!source && <MakerEmpty icon="image" title="사진을 골라 주세요">
      <DioButton variant="filled" icon="image" label="사진 선택" disabled={busy} onPress={choose} />
    </MakerEmpty>}
    {picture}
  </MakerStage>
  return <EditorModal visible transparent animationType="none" onRequestClose={back}>
    <SafeAreaView style={s.backdrop}>
      <View style={s.card}>
        <MakerHeader title="사진 속 대상 오리기" busy={busy} compact={width < 600}
          onBack={close} backLabel="스티커 만들기 나가기">
          {!!source && width >= 600 && stepView}
        </MakerHeader>
        {!!source && width < 600 && <View style={s.stepsRow}>{stepView}</View>}
        {!source ? <View style={s.emptyWrap}>{stage}{status}</View>
          : wide ? <View style={s.columns}>
            <View style={[s.fill, s.mainContent]}>{stage}</View>
            {/* 오른쪽 도구 단은 따로 스크롤하고, 단계 버튼은 단 맨 아래에 고정한다 */}
            <View style={[s.side, { width: sideWidth }]}>
              <ScrollView style={s.fill} scrollEnabled={!sliding} keyboardShouldPersistTaps="handled" contentContainerStyle={s.panel}>{tools}</ScrollView>
              <View style={s.sideAction}>{status}{action}</View>
            </View>
          </View>
          : <>
            <ScrollView style={s.fill} scrollEnabled={!sliding} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
              {stage}
              <View style={s.controls}>{tools}</View>
            </ScrollView>
            <MakerBar stacked={width < 600} note={status}>{action}</MakerBar>
          </>}
      </View>
      <ConfirmDialog open={Boolean(question)} title={question === 'save' ? '이 스티커를 저장할까요?' : question === 'reset' ? '선택을 모두 지울까요?' : question === 'image' ? '이미지를 바꿀까요?' : '작업을 그만둘까요?'}
        message={question === 'save' ? '미리보기 단계라 실제로는 저장되지 않아요.' : question === 'reset' ? '칠한 영역을 처음부터 다시 선택해요.' : question === 'image' ? '지금까지 고른 영역이 사라져요.' : '저장하지 않은 내용은 사라져요.'}
        confirmLabel={question === 'save' ? '확인' : question === 'reset' ? '초기화' : question === 'image' ? '이미지 바꾸기' : '나가기'} cancelLabel={question === 'close' ? '계속 작업하기' : '취소'} danger={question !== 'save'}
        onCancel={() => setQuestion(null)} onConfirm={() => {
          const kind = question; setQuestion(null)
          if (kind === 'save') setSaved(true)
          else if (kind === 'reset') setHistory(emptyCutout())
          else if (kind === 'image') choose()
          else onClose()
        }} />
    </SafeAreaView>
  </EditorModal>
}

const s = StyleSheet.create({
  // 창 전체를 덮는다(좌우·상하 끝까지). 안전 영역은 SafeAreaView 가 비우고 같은 바탕색으로 칠한다.
  backdrop: { flex: 1, backgroundColor: colors.surface },
  card: { flex: 1, width: '100%', backgroundColor: colors.surface, overflow: 'hidden' },
  stepsRow: { paddingHorizontal: 16, paddingTop: 10 },
  fill: { flex: 1 }, content: { padding: 16, gap: 20, paddingBottom: 28 },
  emptyWrap: { flex: 1, padding: 16, gap: 12 }, emptyStage: { flex: 1 },
  // 가로: 왼쪽 작업 판 + 오른쪽 도구 단(따로 스크롤, 단계 버튼은 단 맨 아래 고정). 시트 분리와 같은 여백
  columns: { flex: 1, flexDirection: 'row' }, mainContent: { padding: 16, paddingRight: 12 },
  side: { flexShrink: 0 }, panel: { paddingTop: 16, paddingLeft: 12, paddingRight: 16, paddingBottom: 16, gap: 16 },
  sideAction: { gap: 10, paddingLeft: 12, paddingRight: 16, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1, borderColor: colors.border },
  controls: { gap: 16 },
  toolSection: { gap: 14 },
  sizeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 }, spacer: { flex: 1 },
  heading: { color: colors.text, fontSize: 14, fontWeight: '800' }, value: { color: colors.text, fontSize: 14, fontWeight: '800' },
  folder: { color: colors.text, fontSize: 15, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, color: colors.text, fontSize: 15, fontWeight: '700', paddingHorizontal: 14, minHeight: 48 },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 19 }, error: { color: colors.dangerStrong, fontSize: 14, fontWeight: '700', lineHeight: 20 },
})
