import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import EditorModal from '../controls/EditorModal'
import ConfirmDialog from '../controls/ConfirmDialog'
import StickerSplitSlider from './StickerSplitSlider'
import PenSafeTextInput from '../controls/PenSafeTextInput'
import { FOLDER_NAME_LIMIT } from '../../hooks/useCustomDecor'
import DioButton from '../../../shared/DioButton'
import { MakerBar, MakerEmpty, MakerHeader, MakerNav, MakerSegment, MakerSegmentItem, MakerStage, MakerSteps } from '../../../shared/MakerKit'
import { colors, radius } from '../../../shared/theme'
import { pickCutoutPhoto } from '../../services/stickerCutout'
import { stickerCutoutApi } from '../../services/stickerCutoutApi'
import { CUTOUT_FIT_VIEW as FIT_VIEW, CUTOUT_MAX_POINTS, CUTOUT_MAX_STROKES, CUTOUT_ZOOM_MAX, clampCutoutView, containCutout, cutoutHistory, cutoutPath,
  cutoutPoint, cutoutStrokes, emptyCutout, hasCutoutSelection, zoomCutout } from '../../utils/stickerCutout'

export default function StickerCutoutModal({ folder, onClose, onSave, photoPicker = pickCutoutPhoto, api = stickerCutoutApi }) {
  const { width, height } = useWindowDimensions()
  const wide = width >= 900
  const [source, setSource] = useState(null), sourceRef = useRef(null)
  const [history, setHistory] = useState(emptyCutout)
  const [mode, setMode] = useState('add'), [brushSize, setBrushSize] = useState(24)
  const [brushDraft, setBrushDraft] = useState(null), [sliding, setSliding] = useState(false)
  const shownBrushSize = brushDraft ?? brushSize
  const [draft, setDraft] = useState(null), gesture = useRef(null), origin = useRef({ x: 0, y: 0 })
  const [area, setArea] = useState({ width: 0, height: 0 })
  const [phase, setPhase] = useState('select'), [busy, setBusy] = useState(false), locked = useRef(false)
  const [cutoutId, setCutoutId] = useState(null), cutoutRef = useRef(null)
  // 서버 저장은 같은 선택에 한 번만 한다. 이후 캐시·보관함 저장이 실패해도 같은 mediaFileId로 이어서 처리한다.
  const savedMediaRef = useRef(null)
  const [resultPreview, setResultPreview] = useState(null)
  const [error, setError] = useState(''), [question, setQuestion] = useState(null), [saved, setSaved] = useState(false)
  const [ready, setReady] = useState(false)
  // 폴더 이름은 마지막(스티커 확인)에서 정한다. 이미 연 폴더에 넣을 때는 이름만 보인다
  const [name, setName] = useState(folder?.name ?? '내 스티커')
  const alive = useRef(true), revision = useRef(0)
  // 두 손가락 확대: zoom 1(판에 맞춤) ~ CUTOUT_ZOOM_MAX, x · y 는 사진 가운데가 판 가운데에서 벗어난 거리(px)
  const [view, setView] = useState(FIT_VIEW)
  const rect = zoomCutout(containCutout(source, area), area, view)
  const canPreview = ready && cutoutId && hasCutoutSelection(history)
  const releaseCutout = (id = cutoutRef.current) => {
    if (!id) return
    if (cutoutRef.current === id) cutoutRef.current = null
    api.close(id)
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false; revision.current++; releaseCutout(); sourceRef.current?.dispose?.() } }, [])
  // 회전/크기 변경 중 끝나지 않은 획은 버린다. 확정된 정규화 좌표는 유지한다. 판 크기가 바뀌거나 사진을 바꾸면 맞춤 보기로 돌아간다
  useEffect(() => { gesture.current = null; setDraft(null); setView(FIT_VIEW) }, [width, height, area.width, area.height, source])
  const close = () => {
    if (locked.current) return
    // 서버 PNG는 만들어졌지만 기기 보관함 반영이 실패한 경우, 닫기 전에 재시도 필요성을 분명히 알린다.
    if (savedMediaRef.current && !saved) setQuestion('saveFailedClose')
    else if (history.strokes.length && !saved) setQuestion('close')
    else { releaseCutout(); onClose() }
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
    let next = null
    try {
      next = await photoPicker()
      if (!alive.current || token !== revision.current) { next?.dispose?.(); return }
      if (!next) return
      const opened = await api.open(next)
      if (!alive.current || token !== revision.current) { api.close(opened?.cutoutId); next?.dispose?.(); return }
      const selected = { ...next, selectionKey: token }
      releaseCutout()
      cutoutRef.current = opened.cutoutId
      setCutoutId(opened.cutoutId)
      sourceRef.current?.dispose?.(); sourceRef.current = selected
      savedMediaRef.current = null
      setSource(selected); setReady(false); setHistory(emptyCutout()); setSaved(false); setResultPreview(null); setPhase('select')
    } catch (failure) {
      // 서버 분석이 실패한 새 선택은 아직 sourceRef가 소유하지 않으므로 여기서 정리한다.
      next?.dispose?.()
      if (alive.current && token === revision.current) setError(failure.message || '사진을 열지 못했어요. 다시 선택해 주세요.')
    }
    finally { if (alive.current && token === revision.current) { locked.current = false; setBusy(false) } }
  }
  const analyze = async () => {
    if (locked.current || !canPreview) return
    locked.current = true; setBusy(true); setError('')
    const token = ++revision.current
    try {
      const result = await api.segment(cutoutId, cutoutStrokes(history))
      if (alive.current && token === revision.current) { setResultPreview(result.preview); setPhase('result'); setSaved(false) }
    } catch (failure) { if (alive.current && token === revision.current) setError(failure.message || '미리보기를 열지 못했어요. 다시 시도해 주세요.') }
    finally { if (alive.current && token === revision.current) { locked.current = false; setBusy(false) } }
  }
  const save = async () => {
    if (locked.current || !cutoutId) return
    locked.current = true; setBusy(true); setError('')
    const token = ++revision.current
    try {
      const strokes = cutoutStrokes(history)
      // ①로 돌아가 붓질을 바꾸면 새 선택이므로, 실패했던 이전 결과를 재사용하면 안 된다.
      const selectionKey = JSON.stringify(strokes)
      let savedMedia = savedMediaRef.current?.selectionKey === selectionKey ? savedMediaRef.current.media : null
      if (!savedMedia) {
        savedMedia = await api.save(cutoutId, strokes)
        savedMediaRef.current = { selectionKey, media: savedMedia }
      }
      await api.cache(savedMedia.mediaFileId)
      if (!alive.current || token !== revision.current) return
      const item = { src: `media:${savedMedia.mediaFileId}`, mediaFileId: savedMedia.mediaFileId,
        name: savedMedia.originalFilename || '사진 속 대상', aspect: source?.width && source?.height ? source.width / source.height : 1 }
      const folderName = (folder?.name ?? name).trim() || '내 스티커'
      await onSave?.(folder?.id, folderName, [item])
      if (alive.current && token === revision.current) {
        setSaved(true); releaseCutout(cutoutId); setCutoutId(null)
        // 저장은 이 흐름의 종점이다. 보관함 반영까지 끝난 뒤 이전 화면으로 돌아간다.
        onClose()
      }
    } catch (failure) { if (alive.current && token === revision.current) setError(failure.message || '스티커를 저장하지 못했어요. 다시 시도해 주세요.') }
    finally { if (alive.current && token === revision.current) { locked.current = false; setBusy(false) } }
  }
  const endStroke = cancelled => {
    const stroke = gesture.current; gesture.current = null; setDraft(null)
    if (!cancelled && stroke?.points) setHistory(value => cutoutHistory(value, { type: 'stroke', stroke }))
  }
  // 두 손가락: 칠하던 획은 버리고 확대 · 이동만 한다. 두 손가락 가운데 아래의 사진 지점이 손가락을 따라간다.
  // 판 기준 좌표는 page 좌표에서 판의 page 원점(origin)을 빼서 얻는다. (사진 칸은 확대로 위치가 바뀌므로 판 원점을 쓴다)
  // 기준(거리 · 가운데 · 보기)은 손가락이 붙거나 떨어질 때마다 지금 보기로 다시 잡는다. 안 그러면 다시 댄 손가락을 옛 기준과 비교해 확대가 튄다
  const pinchStart = event => {
    const [a, b] = event.nativeEvent.touches || []
    if (!a || !b) return
    gesture.current = { pinch: true, view, ids: [a.identifier, b.identifier], distance: Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)),
      midX: (a.pageX + b.pageX) / 2 - origin.current.x, midY: (a.pageY + b.pageY) / 2 - origin.current.y }
    setDraft(null)
  }
  const pinchMove = event => {
    const g = gesture.current, [a, b] = event.nativeEvent.touches || []
    if (!a || !b) return
    if (a.identifier !== g.ids[0] || b.identifier !== g.ids[1]) { pinchStart(event); return }
    const zoom = Math.max(1, Math.min(CUTOUT_ZOOM_MAX, g.view.zoom * Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) / g.distance))
    const ratio = zoom / g.view.zoom
    const midX = (a.pageX + b.pageX) / 2 - origin.current.x, midY = (a.pageY + b.pageY) / 2 - origin.current.y
    setView(clampCutoutView(containCutout(source, area), area, { zoom,
      x: midX - area.width / 2 - (g.midX - area.width / 2 - g.view.x) * ratio, y: midY - area.height / 2 - (g.midY - area.height / 2 - g.view.y) * ratio }))
  }
  const startStroke = event => {
    if (!ready || busy || !rect) return
    const { pageX = 0, pageY = 0, locationX, locationY } = event.nativeEvent
    origin.current = { x: pageX - locationX - rect.x, y: pageY - locationY - rect.y }
    if ((event.nativeEvent.touches?.length || 0) > 1) { pinchStart(event); return }
    if (phase !== 'select' || history.strokes.length >= CUTOUT_MAX_STROKES) return
    const point = cutoutPoint(locationX, locationY, rect)
    if (!point) return
    // 붓 크기는 화면 px 그대로: 확대하면 사진 위에서는 가늘어져 가장자리를 섬세하게 칠할 수 있다
    gesture.current = { mode, width: Math.min(1, brushSize / rect.width), points: [point] }
    setDraft({ ...gesture.current })
  }
  const moveStroke = event => {
    if ((event.nativeEvent.touches?.length || 0) > 1) {
      if (gesture.current?.pinch) pinchMove(event)
      else pinchStart(event)
      return
    }
    // 확대하다 한 손가락만 남으면 손을 다 뗄 때까지 칠하지 않는다
    if (!gesture.current?.points) return
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
    onStartShouldSetResponder={() => ready && !busy}
    onMoveShouldSetResponder={() => ready && !busy}
    onResponderGrant={startStroke} onResponderStart={pinchStart} onResponderEnd={pinchStart}
    onResponderMove={moveStroke}
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
    </> : <>
      {/* segment API는 잘라낸 PNG가 아니라 원본 위에 덧그릴 선택 영역 PNG를 반환한다. */}
      <Image pointerEvents="none" source={{ uri: source.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      {!!resultPreview && <Image pointerEvents="none" source={{ uri: resultPreview }} style={StyleSheet.absoluteFill} resizeMode="contain" />}
    </>}
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
      : <PenSafeTextInput value={name} editable={!busy && !saved} onChangeText={setName} maxLength={FOLDER_NAME_LIMIT} placeholder="폴더 이름" placeholderTextColor={colors.textMuted} accessibilityLabel="스티커 폴더 이름" style={s.input} />}
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
      <ConfirmDialog open={Boolean(question)} title={question === 'save' ? '이 스티커를 저장할까요?' : question === 'reset' ? '선택을 모두 지울까요?' : question === 'image' ? '이미지를 바꿀까요?' : question === 'saveFailedClose' ? '보관함 저장을 그만둘까요?' : '작업을 그만둘까요?'}
        message={question === 'save' ? '선택한 대상을 PNG 스티커로 만들어 보관함에 저장해요.' : question === 'reset' ? '칠한 영역을 처음부터 다시 선택해요.' : question === 'image' ? '지금까지 고른 영역이 사라져요.' : question === 'saveFailedClose' ? '스티커 파일은 서버에 저장됐지만 이 기기 보관함에는 아직 추가되지 않았어요. 계속 작업하기에서 다시 저장할 수 있어요.' : '저장하지 않은 내용은 사라져요.'}
        confirmLabel={question === 'save' ? '저장' : question === 'reset' ? '초기화' : question === 'image' ? '이미지 바꾸기' : '나가기'} cancelLabel={question === 'close' || question === 'saveFailedClose' ? '계속 작업하기' : '취소'} danger={question !== 'save'}
        onCancel={() => setQuestion(null)} onConfirm={() => {
          const kind = question; setQuestion(null)
          if (kind === 'save') save()
          else if (kind === 'reset') setHistory(emptyCutout())
          else if (kind === 'image') choose()
          else { releaseCutout(); onClose() }
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
