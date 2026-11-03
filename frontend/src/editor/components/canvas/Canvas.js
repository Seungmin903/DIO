import { Fragment, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Icon from '../controls/Icon'
import { colors, radius, DISABLED_OPACITY } from '../../../shared/theme'
import { PHOTO_SHAPES } from '../../constants'
import { usePan } from '../../hooks/usePan'
import { installDrawingSelectionGuard } from '../../utils/drawingSelectionGuard.js'
import { expandGroups } from '../../state/editorReducer'
import { centerOf, clamp, rotateVector, unionBounds } from '../../utils/common'
import { isMultiSelectKey } from '../../utils/modifiers'
import { coverLayout, photoInnerBox } from '../../utils/objects'
import { isStripFrame, stripCellAt } from '../../utils/photoStrip'
import { pageSize } from '../../utils/pageGeometry.js'
import { placeHorizontal, placeVertical } from '../../utils/popoverPlacement'
import { fitTextHeightPatch, textLayoutKey } from '../../utils/text'
import { eraserPreviewPage } from '../../utils/eraser.js'
import { createLassoOutline, resolveLassoOutline } from '../../utils/lassoOutline.js'
import PageBackground from '../PageBackground'
import ContextBar from './ContextBar'
import { StageOverlay } from './StageOverlay'
import CropHandles from './CropHandles'
import SlotAddButtons from './SlotAddButtons'
import FrameTextEditor, { frameTextAt } from './FrameTextEditor'
import LassoOutline from './LassoOutline'
import StaticPage from './StaticPage'
import ReadingPageContent from './ReadingPageContent'
import { useProgressiveNativePage } from '../../hooks/useProgressiveNativePage.js'
import { usePageReadiness } from '../../hooks/usePageReadiness.js'
import SelectionOverlay from './SelectionOverlay'
import PenInput from '../PenInput'
import EraserInput from '../EraserInput'
import LassoInput from '../LassoInput'
import TextEditor from '../TextEditor'
import ShapeTextEditor from '../ShapeTextEditor'
import TextBoxInput from '../TextBoxInput'
import TextLinkOverlay from '../TextLinkOverlay'
import PalmRejectionArea from './PalmRejectionArea'
import GridOverlay, { DEFAULT_GUIDES, hasGuides } from './GridOverlay'
import { pageGridGuides } from '../../utils/pageGrid.js'
import PaperColorSettings from '../PaperColorSettings'
import { plannerFor } from '../../templates/planners.js'
import { setDayDate, setDayRow, suggestStart } from '../../templates/dayPlanner.js'
import DayNowLine from './DayNowLine'
import DayTimePicker, { DAY_TIME_PICKER, DayPickBackdrop } from '../DayTimePicker'
import DayDatePicker, { DAY_DATE_PICKER } from '../DayDatePicker'
import { paperPrintsText } from '../../templates/paperFont.js'
import { LinkBadges, ObjectLinkOverlay } from './ObjectLinks'
import { isBackdrop } from '../../utils/backdrop.js'
import { shouldCacheCompletedStrokes } from '../../utils/completedStrokePlan.js'

// 렌더링 환경에 requestAnimationFrame이 없으면(Node 테스트 등) 기다리지 않고 바로 실행한다.
const requestFrame = (callback) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : (callback(), 0))
const cancelFrame = (id) => { if (id && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id) }

const SNAP_SCREEN_PX = 6
const LONG_PRESS_MS = 450
// 빈 곳 터치: 이만큼(화면 px) 안에서 움직였으면 탭(선택 해제), 넘으면 영역 선택. 손가락 탭은 3~8px 쯤 흔들린다.
const TAP_MOVE_PX = 10
const MARQUEE_MIN_PX = TAP_MOVE_PX
// 빈 곳을 탭했을 때 이 거리(화면 px) 안의 가장 가까운 요소를 고른다. 손가락 끝 반지름 정도 (터치 목표 최소 44~48pt 의 절반)
const TAP_SLOP_PX = 24
// 요소를 누를 수 있는 최소 크기(화면 px). Apple 44pt · Material 48dp 기준
const MIN_TARGET_PX = 44

/**
 * 편집 캔버스. 논리 좌표(PAGE_WIDTH × PAGE_HEIGHT)에 zoom 을 곱해 그린다.
 * - 탭: 선택 (묶음이면 묶음 전체)
 * - 길게 누르기 / Shift·Ctrl+클릭: 다중 선택에 추가/제외
 * - 드래그: 선택된 요소 함께 이동 (페이지 가운데·다른 요소 중심선에 스냅)
 * - 빈 곳 드래그: 점선 네모(영역 선택) 안에 완전히 들어간 요소를 선택. Shift·Ctrl 을 누르고 있으면 기존 선택에 더한다.
 * - 자르기 중인 사진은 드래그하면 보이는 영역이 움직인다.
 */
export default function Canvas({
  onStrokeCommitted,
  readingImage = null,
  qaPageMeasurement = null,
  colorCaptureRef,
  colorPicking = false,
  textCommitRef,
  onReadingLinkStart,
  showBackground = true,
  compact = false,
  compactMenu = null,
  onCompactMenu,
  page,
  zoom,
  selectedIds,
  cropId,
  dispatch,
  moreOpen,
  onToggleMore,
  contextBarInside,
  contextBarFrame = null, // 선택 바를 작업창 위 층(StageOverlay)에 그릴 때의 자리 { x, y, area } (ContextBar frame)
  onCrop,
  onToast,
  activeTool = 'select',
  inputBlocker = null, // 툴바에서 연 창이 열려 있을 때 캔버스 터치를 대신 받을 핸들러 (그 터치로 그리지 않는다)
  penSettings,
  highlighterSettings,
  straightAssist = true,
  eraserSize,
  eraserMode = 'stroke',
  eraserTarget = 'all',
  lassoShape = 'rectangle',
  lassoMode = 'replace',
  onLassoCommit,
  onLassoModeChange,
  onCreateText,
  onEditText,
  onEditMedia,
  onFillCells,
  onFillSlot,
  frameTextEdit, // 사진 틀의 인쇄 글자를 그 자리에서 고치는 중 { id, line } (이 페이지 것만)
  onEditFrameText, // (object, line) 고치기 시작 · (null) 끝
  onTextSettings,
  onCopy,
  onCut,
  onPaste,
  canPaste,
  paperAppearance, // 지금 페이지 속지 색 { backgroundColor, layoutColor }
  onPaperAppearance, // (appearance, all) => 속지 색 바꾸기
  menuRequest = null, // 손바닥 도구에서 보는 영역이 알려 준 길게 누른 자리 { x, y, key } (페이지 좌표). null 이면 메뉴를 닫는다.
  onTextLink,
  onObjectLink,
  onCopyLink,
  linkBadges = true, // 링크가 걸린 요소에 배지 표시
  textSettingsOpen = false, // 텍스트 서식 창이 열려 있음 (선택 바의 '서식' 버튼 표시)
  gridGuides = DEFAULT_GUIDES, // 격자·보조선 표시 (편집 화면에만. 끌 때 뜨는 맞춤선 guides 와 다르다)
  textEditing,
  textBoundary,
  onRevealText, // (dy) 키보드에 가린 글상자가 보이게 화면을 올린다
  textEditingTop = 0,
  onTextPaletteChange,
  textPaletteBounds,
  onSaveText,
  onCancelText,
  readOnly = false,
}) {
  const drawingSurface = useRef(null)
  const progressiveNative = Platform.OS === 'ios' && !compact && !(readOnly && readingImage) && !colorPicking
  const { generation, pageReady, setReadyPage } = usePageReadiness(page.id, progressiveNative)
  useLayoutEffect(() => { qaPageMeasurement?.emit('canvas-layout') }, [page.id, qaPageMeasurement])
  useLayoutEffect(() => { if (pageReady) qaPageMeasurement?.emit('page-render-ready') }, [page.id, pageReady, qaPageMeasurement])
  const suppressBrowserSelection = Platform.OS === 'web' && !readOnly && !textEditing
    && ['pen', 'highlighter', 'eraser'].includes(activeTool)
  useEffect(() => {
    if (suppressBrowserSelection) return installDrawingSelectionGuard(drawingSurface.current)
  }, [suppressBrowserSelection])
  const { width: PAGE_WIDTH, height: PAGE_HEIGHT } = pageSize(page)
  // 스터디 · 데일리 플래너 속지: 형광펜 · 펜 · 지우개 획을 칸 · 일정 기록으로 받는다.
  const planner = readOnly ? null : plannerFor(page.backgroundAssetId)
  // 데일리 플래너: 시작 · 진행 · 날짜 칸을 누르면 뜨는 고르는 창. draft 는 고르는 중인 기록이고 닫을 때 한 번에 문서에 반영한다(되돌리기 한 번).
  const [dayPick, setDayPick] = useState(null) // { page, kind: 'time' | 'date', row?, at, draft }
  const dayPickRef = useRef(null)
  dayPickRef.current = dayPick
  // 할 일 칸은 글자만 받는다: 이미 쓴 글이 있으면 그 글을 고치고, 없으면 칸에 맞춘 글상자를 만든다.
  const editTitle = (point) => {
    const existing = planner.titleAt(point, page.objects)
    if (existing && onEditText) onEditText(existing)
    else createText({ tap: point })
  }
  // 속지가 받은 입력(획 · 선택 도구로 누른 칸)의 결과를 문서에 반영한다: 새 기록 · 고르는 창 열기 · 할 일 글 입력
  const applyPlannerResult = (result, at) => {
    if (result.planner) dispatch({ type: 'setPlanner', planner: result.planner })
    if (result.picker) setDayPick({ page: page.id, ...result.picker, at, draft: null })
    if (result.text) editTitle(result.text)
  }
  const plannerStroke = planner ? (points, settings) => {
    const result = planner.stroke(page.planner, points, settings, page.objects)
    if (!result) return false
    applyPlannerResult(result, points[0])
    return true
  } : undefined
  const plannerErase = planner ? (value, points) => planner.erase(value, points, eraserMode) : undefined
  // 고르는 중인 기록에도 색을 미리 채워 막대가 바로 제 색으로 보이게 한다(닫을 때 한 번에 반영되므로 되돌리기도 한 번).
  const withAutoColor = (value) => planner.autoColor(value, page.objects) ?? value
  const closeDayPick = () => {
    const pick = dayPickRef.current
    if (pick?.draft) dispatch({ type: 'setPlanner', planner: pick.draft, pageId: pick.page })
    setDayPick(null)
  }
  const closeDayPickRef = useRef(closeDayPick)
  closeDayPickRef.current = closeDayPick
  // 도구를 바꾸거나 페이지를 넘기면 고르던 값을 반영하고 창을 닫는다.
  useEffect(() => () => closeDayPickRef.current(), [page.id, activeTool])
  // 할 일 · 시작 · 진행이 채워진 줄에 색이 저절로 채워진다. 글자를 쓰는 일이 따로 되돌리기 단위라, 색은 되돌리기 단위를 만들지 않는다.
  // 페이지를 막 열었을 때는 건너뛴다: 열람만으로 문서가 바뀌어 저장 · 동기화가 일어나지 않게 한다(색은 그 뒤 편집에서 채워진다).
  const autoColorPage = useRef(null)
  useEffect(() => {
    if (planner?.kind !== 'day') return
    if (autoColorPage.current !== page.id) { autoColorPage.current = page.id; return }
    const next = planner.autoColor(page.planner, page.objects)
    if (next) dispatch({ type: 'setPlanner', planner: next, pageId: page.id, silent: true })
  }, [page.planner, page.objects, page.backgroundAssetId]) // eslint-disable-line react-hooks/exhaustive-deps
  // 지우는 중인 플래너 기록(손을 떼면 문서에 확정). 그동안 속지는 이 기록으로 그린다. 시간 창에서 고르는 중인 일정도 같은 식으로 속지에 바로 보인다.
  const [plannerDraft, setPlannerDraft] = useState(null)
  const shownPlanner = plannerDraft ?? (dayPick?.page === page.id ? dayPick.draft : null)
  const backgroundPage = useMemo(() => shownPlanner ? { ...page, planner: shownPlanner } : page, [page, shownPlanner])
  // 텍스트 도구로 할 일 · 메모 · 돌아보기 줄을 탭하면 그 줄에 맞춘 글상자(폭 · 글자 크기 · 줄간격 고정)를 만든다.
  const createText = ({ tap, ...box }) => {
    const cell = planner && tap ? planner.cellTap(tap) : null
    if (cell) { setDayPick({ page: page.id, ...cell.picker, at: tap, draft: null }); return }
    const slot = planner && tap ? planner.textSlot(tap) : null
    if (!slot) return onCreateText(box)
    const { width, ...rest } = slot
    onCreateText({ ...rest, width, w: width, baseWidth: width, h: slot.fontSize * slot.lineSpacing })
  }
  const changePlannerOptions = (patch) => dispatch({ type: 'setPlanner', planner: planner.setOptions(page.planner, patch) })
  const [lassoDrawing, setLassoDrawing] = useState(false)
  // 고치는 중인 틀. 틀 선택이 풀리거나 잠기면 입력칸을 내린다.
  const frameTextObject = frameTextEdit && selectedIds.includes(frameTextEdit.id) ? page.objects.find((o) => o.id === frameTextEdit.id && !o.locked) : null
  const [lassoCapture, setLassoCapture] = useState(false)
  const [lassoOutline, setLassoOutline] = useState(null)
  const outlinePaths = activeTool === 'lasso'
    ? resolveLassoOutline(lassoOutline, page.id, selectedIds, page.objects) : null
  useEffect(() => {
    if (lassoOutline && !outlinePaths) setLassoOutline(null)
  }, [lassoOutline, outlinePaths])
  useEffect(() => { setLassoDrawing(false); setLassoCapture(false) }, [page.id, activeTool])
  const [guides, setGuides] = useState(null)
  const [rotationLabel, setRotationLabel] = useState(null)
  const [interacting, setInteracting] = useState(false)
  const [draggingIds, setDraggingIds] = useState(null) // 끌어서 옮기는 중인 스티커·테이프·사진 (놓기 전까지 반투명)
  const [textMeasurements, setTextMeasurements] = useState({})
  useEffect(() => { setTextMeasurements({}) }, [page.id])
  // 내용의 실제 높이는 최소 높이로만 사용한다. 사용자가 늘린 빈 공간은 유지한다.
  const fitTextHeight = (id, h) => {
    const object = page.objects.find((o) => o.id === id)
    if (object?.type !== 'text' || !Number.isFinite(h) || h <= 0) return
    const key = textLayoutKey(object)
    setTextMeasurements(current => current[id]?.key === key && Math.abs(current[id].h - h) < 0.01 ? current : { ...current, [id]: { key, h } })
    const patch = fitTextHeightPatch(object, h)
    if (patch) dispatch({ type: 'updateObject', id, patch })
  }
  const eraseDrawing = useRef(null)
  const previewErase = (ids, pieces = null, ticket = null) => eraseDrawing.current?.preview(ids, pieces, ticket)
  const visible = page.objects.filter((o) => !o.hidden)
  const touchSelectable = visible.filter((o) => o.type !== 'stroke' && !isBackdrop(o))
  const selected = visible.filter((o) => selectedIds.includes(o.id))
  const lassoEditing = activeTool === 'lasso' && selected.length > 0 && !lassoDrawing && !lassoCapture
  const canSelect = !readOnly && !textEditing && (activeTool === 'select' || lassoEditing)
  // 텍스트 도구에서도 글자는 선택 도구처럼 누르면 선택, 다시 누르면 수정, 끌면 이동한다. (빈 곳을 누르면 새 글상자)
  const textTool = !readOnly && !textEditing && activeTool === 'text'
  const canTouch = canSelect || textTool
  const replacingLasso = activeTool === 'lasso' && lassoDrawing && lassoMode === 'replace'
  const showSelection = !replacingLasso && (canTouch || (!readOnly && !textEditing && activeTool === 'lasso'))
  const cropping = Boolean(cropId)
  const lassoMove = useRef(null)
  const startLassoMove = () => {
    Keyboard.dismiss()
    const moving = selected.filter(object => !object.locked)
    lassoMove.current = {
      starts: Object.fromEntries(moving.map(object => [object.id, { x: object.x, y: object.y }])),
      bounds: moving.length ? unionBounds(moving) : null,
      others: visible.filter(object => !selectedIds.includes(object.id)),
      checkpointed: false,
    }
    setInteracting(true)
  }
  const moveLassoSelection = (dx, dy) => {
    const move = lassoMove.current
    if (!move?.bounds || (!move.checkpointed && Math.hypot(dx, dy) * zoom < 3)) return
    if (!move.checkpointed) {
      dispatch({ type: 'checkpoint' })
      move.checkpointed = true
      setDraggingIds(selected.filter(object => move.starts[object.id] && FADE_WHILE_DRAGGING.includes(object.type)).map(object => object.id))
    }
    const guideX = nearest([PAGE_WIDTH / 2, ...move.others.map(object => centerOf(object).x)], move.bounds.cx + dx, SNAP_SCREEN_PX / zoom)
    const guideY = nearest([PAGE_HEIGHT / 2, ...move.others.map(object => centerOf(object).y)], move.bounds.cy + dy, SNAP_SCREEN_PX / zoom)
    const ox = dx + (guideX == null ? 0 : guideX - move.bounds.cx - dx)
    const oy = dy + (guideY == null ? 0 : guideY - move.bounds.cy - dy)
    setGuides(guideX == null && guideY == null ? null : { x: guideX, y: guideY })
    dispatch({ type: 'updateMany', patches: Object.fromEntries(Object.entries(move.starts).map(([id, start]) => [id, { x: start.x + ox, y: start.y + oy }])) })
  }
  const endLassoMove = cancelled => {
    if (cancelled && lassoMove.current?.checkpointed) dispatch({ type: 'revertToCheckpoint' })
    else if(lassoMove.current?.checkpointed) dispatch({type:'commitCheckpoint'})
    lassoMove.current = null
    setInteracting(false)
    setDraggingIds(null)
    setGuides(null)
  }
  // 사각·라운드 사진은 PPT 처럼 테두리 손잡이로 자유롭게 자른다.
  const freeCropTarget = visible.find(
    (o) => o.id === cropId && o.frame === 'shape' && !PHOTO_SHAPES.find((s) => s.id === o.shape)?.square,
  )

  const [marquee, setMarquee] = useState(null) // 논리 좌표 { left, top, right, bottom }
  const marqueeRef = useRef(null)
  // 빈 곳을 길게 누르면 뜨는 메뉴: 붙여넣기 · 속지 색. { x, y } 는 페이지 좌표, panel: 'paper' 면 그 자리에 속지 색 말풍선
  // 선택 도구는 이 페이지가 터치를 받아 직접 열고, 손바닥 도구는 화면을 옮기는 보는 영역이 길게 누른 자리를 알려 준다(menuRequest).
  const [emptyMenu, setEmptyMenu] = useState(null)
  const canPageMenu = canSelect || (!readOnly && !textEditing && activeTool === 'hand')
  useEffect(() => {
    const inside = menuRequest && menuRequest.x >= 0 && menuRequest.y >= 0 && menuRequest.x <= PAGE_WIDTH && menuRequest.y <= PAGE_HEIGHT
    setEmptyMenu(inside ? { x: menuRequest.x, y: menuRequest.y } : null)
  }, [menuRequest]) // eslint-disable-line react-hooks/exhaustive-deps
  // 도구를 바꾸면 열어 둔 메뉴를 닫는다 (다른 도구로 갔다 돌아왔을 때 예전 메뉴가 다시 보이지 않게)
  useEffect(() => { setEmptyMenu(null) }, [activeTool])
  const backgroundHandlers = usePan({
    onStart: (event) => {
      Keyboard.dismiss()
      setEmptyMenu(null)
      if (!canSelect) return
      const m = {
        x: event.locationX / zoom,
        y: event.locationY / zoom,
        base: isMultiSelectKey() ? selectedIds : [],
        previousSelection: selectedIds,
        key: null, // 영역 선택이 시작되면 빈 결과라도 한 번은 반영한다
        maxMove: 0,
      }
      marqueeRef.current = m
      // 움직이지 않고 오래 누르면 메뉴를 띄우고, 이 터치는 영역 선택·탭으로 쓰지 않는다
      m.holdTimer = setTimeout(() => {
        if (marqueeRef.current !== m || m.maxMove >= TAP_MOVE_PX) return
        m.longPressed = true
        setEmptyMenu({ x: m.x, y: m.y })
      }, LONG_PRESS_MS)
    },
    onMove: (dx, dy) => {
      const m = marqueeRef.current
      if (m) m.maxMove = Math.max(m.maxMove, Math.hypot(dx, dy))
      if (m?.longPressed) return
      if (!m || cropping || m.maxMove < MARQUEE_MIN_PX) return
      const rect = {
        left: Math.min(m.x, m.x + dx / zoom),
        right: Math.max(m.x, m.x + dx / zoom),
        top: Math.min(m.y, m.y + dy / zoom),
        bottom: Math.max(m.y, m.y + dy / zoom),
      }
      setMarquee(rect)
      // 점선 네모 안에 완전히 들어간 요소만 고른다. 그룹은 구성 요소가 모두 들어갔을 때만 통째로 고른다.
      // (예전에는 회전 전 외곽 상자가 조금만 걸쳐도, 또 그룹 하나만 걸쳐도 그룹 전체가 선택됐다)
      const inside = new Set(touchSelectable.filter((o) => cornersOf(o).every((p) => contains(rect, p))).map((o) => o.id))
      const hits = [...inside].filter((id) => {
        const groupId = visible.find((o) => o.id === id).groupId
        return !groupId || visible.every((o) => o.groupId !== groupId || inside.has(o.id))
      })
      const ids = [...new Set([...m.base, ...hits])]
      // 걸친 요소가 바뀔 때만 선택을 갱신한다.
      const key = ids.join(',')
      if (key !== m.key) {
        m.key = key
        dispatch({ type: 'selectExact', ids })
      }
    },
    onEnd: ({ cancelled }) => {
      const start = marqueeRef.current
      marqueeRef.current = null
      clearTimeout(start?.holdTimer)
      setMarquee(null)
      if (start?.longPressed) return
      if (cancelled && start?.key != null) {
        dispatch({ type: 'selectExact', ids: start.previousSelection })
      }
      // 두 손가락 제스처로 넘어간 경우에는 선택을 건드리지 않는다.
      // 조금 흔들린 탭도 탭으로 본다. (usePan 의 moved 는 3px 만 넘어도 true 라 기기에서 선택 해제가 자주 안 됐다)
      if (!start || cancelled || cropping || start.maxMove >= TAP_MOVE_PX) return
      // 요소를 살짝 빗나가게 눌렀으면 가장 가까운 요소를 고른다 (지도 게임·노트 앱의 '가까운 것 고르기').
      // 이미 선택된 요소 근처를 누른 것은 '선택 풀기'로 본다. (요소가 하나뿐일 때 빈 곳을 눌러도 안 풀리던 문제)
      // 속지의 칸(완료 · 할 일 · 시작 · 진행 · 날짜 · 일정 막대)을 누르면 선택 도구에서도 바로 그 칸의 입력이 열린다.
      const edit = planner && start ? planner.editTap(page.planner, start, page.objects, penSettings.color) : null
      if (edit) { dispatch({ type: 'select', ids: [] }); applyPlannerResult(edit, start); return }
      const near = start && nearestObject(touchSelectable, start, TAP_SLOP_PX / zoom)
      dispatch({ type: 'select', ids: near && !selectedIds.includes(near.id) ? [near.id] : [] })
    },
  })

  const pageGuides = pageGridGuides(page, gridGuides)
  const guideUnderlay = !readOnly && hasGuides(pageGuides) ? <>
    <GridOverlay guides={pageGuides} layer="grid" width={PAGE_WIDTH} height={PAGE_HEIGHT} zoom={zoom} />
    <GridOverlay guides={gridGuides} layer="guides" width={PAGE_WIDTH} height={PAGE_HEIGHT} zoom={zoom} />
  </> : null
  // 선택 바는 작업창 좌표(contextBarFrame)가 있을 때만 작업창 위 층으로 보낸다.
  // 작업창 크기를 재기 전(null)에는 페이지 좌표 그대로 페이지 안에 그린다. 작업창 층에 보내면 확대·이동한 만큼 어긋난다.
  const SelectionBarLayer = contextBarFrame ? StageOverlay : Fragment

  return (
    <View
      ref={drawingSurface}
      pointerEvents={pageReady ? 'auto' : 'none'}
      accessibilityState={{ busy: !pageReady }}
      accessibilityLabel={readOnly ? '다이어리 읽기 캔버스' : `${{ hand: '손바닥', select: '선택', pen: '펜', highlighter: '형광펜', eraser: '지우개', text: '텍스트', lasso: '올가미' }[activeTool]} 캔버스`}
      style={[styles.page, suppressBrowserSelection && styles.drawingSurface, { width: PAGE_WIDTH * zoom, height: PAGE_HEIGHT * zoom }, Platform.OS === 'web' && { cursor: readOnly ? 'default' : activeTool === 'hand' ? 'grab' : activeTool === 'text' ? 'text' : canSelect ? 'default' : 'crosshair' }]}
      {...(canSelect && activeTool === 'select' ? backgroundHandlers : {})}
    >
      <View ref={colorCaptureRef} testID="color-capture-surface" collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill}>
      {showBackground && !readingImage ? <PageBackground page={backgroundPage} zoom={zoom} underlay={colorPicking ? null : guideUnderlay} /> : colorPicking ? null : guideUnderlay}
      {planner?.kind === 'day' && showBackground && <DayNowLine planner={planner} value={page.planner} zoom={zoom} />}
      {/*
        그림 층: 페이지 썸네일과 같은 StaticPage 로 그린다. (썸네일이 이 화면을 그대로 비춘다) 터치는 받지 않는다.
        iPad 에서 터치용 View 안에 그리면 요소가 하나도 보이지 않는 문제가 있어 그리기와 터치를 나눴다.
      */}
      <View style={styles.clip} pointerEvents="none">
        {readOnly && readingImage ? <ReadingPageContent image={readingImage} page={page} zoom={zoom} background="transparent" /> : <EraserPreviewDrawing ref={eraseDrawing} page={page} activeTool={activeTool} textEditingId={textEditing?.id} enabled={progressiveNative} generation={generation} onReady={setReadyPage} qaPageMeasurement={qaPageMeasurement} zoom={zoom} cropId={cropId} background="transparent" showBackground={false} fadeIds={draggingIds} stillIds={interacting ? selectedIds : null} textMeasureReady={pageReady} onTextMeasure={readOnly || interacting || !pageReady ? null : fitTextHeight} cacheStrokes={shouldCacheCompletedStrokes(Platform.OS, readOnly, activeTool)} />}
      </View>
      </View>
      {!pageReady && <View pointerEvents="none" accessibilityRole="progressbar" accessibilityLabel="페이지 불러오는 중" style={styles.pageLoading}><Text style={styles.pageLoadingText}>페이지 불러오는 중</Text></View>}
      {readOnly && <TextLinkOverlay objects={page.objects} zoom={zoom} onError={onToast} onInteractionStart={onReadingLinkStart} />}
      {readOnly && <ObjectLinkOverlay objects={page.objects} zoom={zoom} onError={onToast} onInteractionStart={onReadingLinkStart} />}
      {pageReady && !readOnly && linkBadges && <LinkBadges objects={page.objects} zoom={zoom} selectedIds={selectedIds} onSelect={(id) => dispatch({ type: 'select', ids: [id] })} />}
      {!readOnly && activeTool === 'lasso' && !textEditing && (
        <LassoInput key={[page.id, zoom, lassoShape, lassoMode].join('-')} objects={page.objects}
          selectedIds={selectedIds} shape={lassoShape} mode={lassoMode} zoom={zoom}
          pageWidth={PAGE_WIDTH} pageHeight={PAGE_HEIGHT} captureAll={!lassoEditing || Boolean(outlinePaths)}
          selectionPaths={!lassoCapture && !cropping ? outlinePaths : null}
          onSelectionMoveStart={startLassoMove} onSelectionMove={moveLassoSelection} onSelectionMoveEnd={endLassoMove}
          onDrawingChange={setLassoDrawing}
          onClearSelection={() => { setLassoOutline(null); setLassoCapture(false); onLassoCommit([]) }}
          onCommit={(ids, result) => {
            setLassoOutline(result
              ? createLassoOutline(lassoOutline, page.id, selectedIds, ids, page.objects, result.polygon, result.mode) : null)
            setLassoCapture(false)
            onLassoCommit(ids)
          }} />
      )}
      {/* 터치 층: 요소마다 같은 자리에 투명한 상자를 두고 선택·이동을 받는다. */}
      <View style={[styles.hitLayer, (activeTool === 'lasso' || textTool) && { zIndex: 1 }]} pointerEvents={canTouch && !outlinePaths ? 'box-none' : 'none'}
        // 틀 글자를 고치다 캔버스를 누르면 입력을 끝낸다 (네이티브는 입력칸 밖을 눌러도 포커스가 남는다)
        onTouchStart={frameTextEdit ? () => { Keyboard.dismiss(); onEditFrameText(null) } : undefined}>
        {pageReady && visible.filter((object) => !isBackdrop(object) && (textTool ? object.type === 'text' : object.type !== 'stroke' || selectedIds.includes(object.id))).map((object) => (
          <CanvasObject
            key={object.id}
            object={object}
            pageWidth={PAGE_WIDTH}
            pageHeight={PAGE_HEIGHT}
            objects={page.objects}
            zoom={zoom}
            selectedIds={selectedIds}
            cropping={cropping}
            isCropTarget={object.id === cropId}
            dispatch={dispatch}
            onGuides={setGuides}
            onInteracting={setInteracting}
            onDragging={setDraggingIds}
            onEditText={onEditText}
            onEditMedia={onEditMedia}
            onEditFrameText={onEditFrameText}
            directEdit={Boolean(planner?.titleAt({ x: object.x + object.w / 2, y: object.y + object.h / 2 }, [object]))}
          />
        ))}
      </View>

      {/* 펜·형광펜·지우개: 손바닥은 거르고 펜(또는 첫 손가락) 하나만 따라 그린다 */}
      <PalmRejectionArea>
      {!readOnly && ['pen', 'highlighter'].includes(activeTool) && (
        <View style={styles.penClip}>
          {/* 확대·축소 중에 다시 만들지 않는다 (손가락 아래의 입력 영역이 바뀌면 웹에서 터치 끝이 전달되지 않는다) */}
          <PenInput onStrokeCommitted={onStrokeCommitted} key={`${page.id}-${activeTool}`} zoom={zoom} pageWidth={PAGE_WIDTH} pageHeight={PAGE_HEIGHT} dispatch={dispatch} objectCount={page.objects.length} straightAssist={straightAssist} settings={activeTool === 'highlighter' ? highlighterSettings : penSettings} onPlannerStroke={plannerStroke} />
        </View>
      )}
      {!readOnly && activeTool === 'eraser' && <View style={styles.penClip}>
        <EraserInput key={`${page.id}-${zoom}-${eraserSize}-${eraserMode}-${eraserTarget}`} compact={compact} objects={page.objects} diameter={eraserSize} mode={eraserMode} target={eraserTarget} zoom={zoom} dispatch={dispatch} onPreview={previewErase} planner={page.planner} onPlannerErase={plannerErase} onPlannerPreview={setPlannerDraft} />
      </View>}
      {planner?.kind === 'day' && dayPick?.page === page.id && <View style={styles.penClip}><DayPickBackdrop onClose={closeDayPick} /></View>}
      </PalmRejectionArea>
      {/* 창을 닫으려고 누른 터치는 여기서 삼키고 창만 닫는다. 펜·형광펜에 점이 찍히던 문제 */}
      {inputBlocker && ['pen', 'highlighter', 'eraser'].includes(activeTool) && (
        <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} {...inputBlocker} accessibilityElementsHidden />
      )}
      {planner?.kind === 'day' && dayPick?.page === page.id && dayPick.kind === 'time' && (
        <DayTimePicker
          key={`${dayPick.page}-${dayPick.row}`}
          row={dayPick.row}
          value={planner.normalize(page.planner).rows[dayPick.row] ?? null}
          suggest={{ start: suggestStart(page.planner), dur: 60 }}
          onChange={(next) => setDayPick(current => current && { ...current, draft: withAutoColor(setDayRow(page.planner, current.row, { color: null, ...planner.normalize(page.planner).rows[current.row], ...(next.allDay ? { start: null, dur: null, allDay: true } : { start: next.start, dur: next.dur, allDay: false }) })) })}
          onClear={() => {
            const row = planner.normalize(page.planner).rows[dayPick.row]
            if (row) dispatch({ type: 'setPlanner', planner: setDayRow(page.planner, dayPick.row, row.color ? { ...row, start: null, dur: null, allDay: false } : null) })
            setDayPick(null)
          }}
          onClose={closeDayPick}
          style={pickerPosition(dayPick.at, zoom, PAGE_WIDTH, PAGE_HEIGHT, DAY_TIME_PICKER)}
        />
      )}
      {planner?.kind === 'day' && dayPick?.page === page.id && dayPick.kind === 'date' && (
        <DayDatePicker
          key={`${dayPick.page}-date`}
          value={planner.normalize(page.planner).date}
          suggest={todayDate()}
          onChange={(next) => setDayPick(current => current && { ...current, draft: setDayDate(page.planner, next) })}
          onClear={() => {
            if (planner.normalize(page.planner).date) dispatch({ type: 'setPlanner', planner: setDayDate(page.planner, null) })
            setDayPick(null)
          }}
          onClose={closeDayPick}
          style={pickerPosition(dayPick.at, zoom, PAGE_WIDTH, PAGE_HEIGHT, DAY_DATE_PICKER)}
        />
      )}
      {!readOnly && activeTool === 'text' && !textEditing && <TextBoxInput key={`${page.id}-${zoom}`} zoom={zoom} pageWidth={PAGE_WIDTH} pageHeight={PAGE_HEIGHT} onCreate={createText} />}
      {!readOnly && textEditing?.type === 'shape' && <ShapeTextEditor commitRef={textCommitRef} key={textEditing.id} object={textEditing} zoom={zoom} onSave={onSaveText} boundary={textBoundary} onReveal={onRevealText} visibleTop={textEditingTop} onPaletteChange={onTextPaletteChange} paletteBounds={textPaletteBounds} onToast={onToast} />}
      {!readOnly && textEditing && textEditing.type !== 'shape' && <TextEditor commitRef={textCommitRef} onToast={onToast} onPaletteChange={onTextPaletteChange} paletteBounds={textPaletteBounds} boundary={textBoundary} key={textEditing.id} object={textEditing} zoom={zoom} onSave={onSaveText} onCancel={onCancelText} onReveal={onRevealText} />}

      {/* 사진 틀의 빈 자리 + (선택 도구에서만) */}
      {canSelect && !cropping && !interacting && !marquee && onFillSlot && (
        <View pointerEvents="box-none" style={styles.selectionControls}>
          <SlotAddButtons objects={page.objects} zoom={zoom} onFill={onFillSlot} />
        </View>
      )}
      {!readOnly && frameTextObject && !interacting && (
        <View pointerEvents="box-none" style={styles.selectionControls}>
          <FrameTextEditor key={`${frameTextEdit.id}-${frameTextEdit.line}`} object={frameTextObject} line={frameTextEdit.line} zoom={zoom} dispatch={dispatch} onClose={() => onEditFrameText(null)} onReveal={onRevealText} />
        </View>
      )}
      {freeCropTarget && <View pointerEvents="box-none" style={styles.selectionControls}><CropHandles photo={freeCropTarget} zoom={zoom} dispatch={dispatch} /></View>}

      {guides?.x != null && <View style={[styles.guideV, { left: guides.x * zoom }]} pointerEvents="none" />}
      {guides?.y != null && <View style={[styles.guideH, { top: guides.y * zoom }]} pointerEvents="none" />}

      {outlinePaths && !replacingLasso && !cropping && !marquee && (
        <LassoOutline paths={outlinePaths} zoom={zoom} pageWidth={PAGE_WIDTH} pageHeight={PAGE_HEIGHT} />
      )}
      {showSelection && !outlinePaths && selected.length === 1 && !cropping && !marquee && (
        <View pointerEvents={canTouch ? "box-none" : "none"} style={styles.selectionControls}>
        <SelectionOverlay
          object={selected[0]}
          textMinHeight={selected[0].type === 'text' && textMeasurements[selected[0].id]?.key === textLayoutKey(selected[0]) ? textMeasurements[selected[0].id].h : null}
          zoom={zoom}
          dispatch={dispatch}
          onRotation={setRotationLabel}
          onInteracting={setInteracting}
        />
        </View>
      )}
      {!outlinePaths && !replacingLasso && selected.length > 1 && !marquee && <GroupFrame objects={selected} zoom={zoom} />}
      {!outlinePaths && !replacingLasso && selected.length === 1 && selected[0].groupId && !cropping && !marquee && (
        <GroupFrame objects={visible.filter((o) => o.groupId === selected[0].groupId)} zoom={zoom} inside />
      )}
      {/* 영역 선택 중: 지금 네모 안에 들어와 선택될 요소마다 선택 테두리 모양의 선을 보여 준다. */}
      {marquee && selected.map((object) => <HitOutline key={object.id} object={object} zoom={zoom} />)}
      {emptyMenu?.panel === 'paper' && canPageMenu && (
        <PaperColorSettings
          appearance={paperAppearance}
          onChange={(appearance, all) => onPaperAppearance?.(appearance, all)}
          onClose={() => setEmptyMenu(null)}
          planner={planner ? planner.normalize(page.planner) : null}
          plannerKind={planner?.kind}
          showFont={paperPrintsText(page.backgroundAssetId)}
          onPlannerOptions={changePlannerOptions}
          style={paperBubblePosition(emptyMenu, zoom, PAGE_WIDTH, PAGE_HEIGHT, (planner ? (planner.kind === 'day' ? 70 : 250) : 0) + (paperPrintsText(page.backgroundAssetId) ? 96 : 0))}
        />
      )}
      {emptyMenu && !emptyMenu.panel && canPageMenu && (
        <EmptyMenu
          at={emptyMenu}
          zoom={zoom}
          pageWidth={PAGE_WIDTH}
          pageHeight={PAGE_HEIGHT}
          canPaste={canPaste}
          onPaste={() => { setEmptyMenu(null); onPaste?.(emptyMenu) }}
          paperLabel={planner ? '속지 옵션' : '속지 색'}
          onPaperColor={() => setEmptyMenu({ ...emptyMenu, panel: 'paper' })}
        />
      )}
      {marquee && (
        <View
          pointerEvents="none"
          style={[
            styles.marquee,
            {
              left: marquee.left * zoom,
              top: marquee.top * zoom,
              width: (marquee.right - marquee.left) * zoom,
              height: (marquee.bottom - marquee.top) * zoom,
            },
          ]}
        />
      )}

      {rotationLabel != null && selected.length === 1 && (
        <View
          style={[
            styles.angleBadge,
            {
              left: centerOf(selected[0]).x * zoom - 34,
              top: centerOf(selected[0]).y * zoom - 16,
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.angleText}>{Math.round(rotationLabel) % 360}°</Text>
        </View>
      )}

      {canTouch && selected.length > 0 && !cropping && !interacting && !marquee && (
        <SelectionBarLayer>
        <View pointerEvents="box-none" style={contextBarFrame ? StyleSheet.absoluteFill : styles.selectionMenu}>
        <ContextBar
          compactMenu={compactMenu}
          onCompactMenu={onCompactMenu}
          onTextLink={onTextLink}
          onObjectLink={onObjectLink}
          onCopyLink={onCopyLink}
          onEditText={onEditText}
          onTextSettings={onTextSettings}
          textSettingsOpen={textSettingsOpen}
          onCopy={onCopy}
          onCut={onCut}
          onPaste={onPaste}
          canPaste={canPaste}
          key={selectedIds.join(',')}
          objects={selected}
          allObjects={page.objects}
          lassoActions={activeTool === 'lasso' ? { mode: lassoMode, onModeChange: (mode) => { setLassoCapture(true); onLassoModeChange(mode) } } : null}
          pageWidth={PAGE_WIDTH}
          pageHeight={PAGE_HEIGHT}
          zoom={zoom}
          dispatch={dispatch}
          moreOpen={moreOpen}
          onToggleMore={onToggleMore}
          onCrop={onCrop}
          onFillCells={onFillCells}
          onToast={onToast}
          insideHandlers={contextBarInside}
          frame={contextBarFrame}
        />
        </View>
        </SelectionBarLayer>
      )}
    </View>
  )
}

// 누른 자리 기준 메뉴도 선택 바와 같은 규칙(utils/popoverPlacement): 누른 자리 위 먼저, 안 되면 아래, 가로는 가운데 맞춤
const pointBox = (at, zoom) => ({ top: at.y * zoom, bottom: at.y * zoom, handleY: null })
// 속지 색 말풍선
const PAPER_BUBBLE = { width: 300, height: 290 }
function paperBubblePosition(at, zoom, pageWidth, pageHeight, extraHeight = 0) {
  const left = placeHorizontal(at.x * zoom, PAPER_BUBBLE.width, pageWidth * zoom)
  // 플래너 옵션이 붙으면 창이 길어진다.
  const { top } = placeVertical(pointBox(at, zoom), PAPER_BUBBLE.height + extraHeight, pageHeight * zoom)
  return { position: 'absolute', zIndex: 6, width: PAPER_BUBBLE.width, left, top }
}
// 데일리 플래너 고르는 창(시간 · 날짜): 누른 칸 위에 먼저, 안 되면 아래
function pickerPosition(at, zoom, pageWidth, pageHeight, size) {
  const left = placeHorizontal(at.x * zoom, size.width, pageWidth * zoom)
  const { top } = placeVertical(pointBox(at, zoom), size.height, pageHeight * zoom)
  return { position: 'absolute', zIndex: 6, width: size.width, left, top }
}
const todayDate = () => { const now = new Date(); return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() } }

/** 빈 곳 길게 누르기 메뉴. 요소 편집 바와 같은 모양으로 누른 자리 위에 띄운다 */
const EMPTY_MENU = { width: 210, height: 52 }
function EmptyMenu({ at, zoom, pageWidth, pageHeight, canPaste, onPaste, onPaperColor, paperLabel = '속지 색' }) {
  const { width } = EMPTY_MENU
  const left = placeHorizontal(at.x * zoom, width, pageWidth * zoom)
  const { top } = placeVertical(pointBox(at, zoom), EMPTY_MENU.height, pageHeight * zoom)
  return (
    <View style={[styles.emptyMenu, { left, top, width }]} accessibilityLabel="빈 곳 메뉴">
      <MenuButton icon="clipboard" label="붙여넣기" disabled={!canPaste} onPress={onPaste} />
      <MenuButton icon="roller" label={paperLabel} onPress={onPaperColor} />
    </View>
  )
}

function MenuButton({ icon, label, disabled, onPress }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [styles.menuButton, pressed && styles.menuPressed, disabled && styles.menuDisabled]}>
      <Icon name={icon} size={17} forText={12.5} color={colors.text} />
      <Text style={styles.menuText}>{label}</Text>
    </Pressable>
  )
}

function HitOutline({ object, zoom }) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.hit,
        {
          left: object.x * zoom - 1.5,
          top: object.y * zoom - 1.5,
          width: object.w * zoom + 3,
          height: object.h * zoom + 3,
          transform: [{ rotate: `${object.rotation}deg` }],
        },
      ]}
    />
  )
}

function GroupFrame({ objects, zoom, inside }) {
  const bounds = unionBounds(objects)
  const pad = 8
  return (
    <View
      pointerEvents="none"
      style={[
        styles.groupFrame,
        inside && styles.groupFrameInside,
        {
          left: bounds.left * zoom - pad,
          top: bounds.top * zoom - pad,
          width: (bounds.right - bounds.left) * zoom + pad * 2,
          height: (bounds.bottom - bounds.top) * zoom + pad * 2,
        },
      ]}
    >
      {!inside && <Text style={styles.groupLabel}>{objects.length}개 선택</Text>}
    </View>
  )
}

const contains = (rect, p) => p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom

/** 회전을 반영한 네 꼭짓점 (논리 좌표) */
function cornersOf(object) {
  const c = centerOf(object)
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    const v = rotateVector((sx * object.w) / 2, (sy * object.h) / 2, object.rotation)
    return { x: c.x + v.x, y: c.y + v.y }
  })
}

function nearest(values, target, threshold) {
  let best = null
  let bestDistance = threshold
  for (const value of values) {
    const distance = Math.abs(value - target)
    if (distance <= bestDistance) {
      best = value
      bestDistance = distance
    }
  }
  return best
}

/** 터치 위치 → 페이지 좌표. locationX·Y 는 회전 전 요소 상자 기준이다. */
function pagePoint(object, event, zoom) {
  const c = centerOf(object)
  const local = rotateVector(event.locationX / zoom - object.w / 2, event.locationY / zoom - object.h / 2, object.rotation)
  return { x: c.x + local.x, y: c.y + local.y }
}

/** 화면에서 MIN_TARGET_PX 보다 작은 요소의 터치 여유 */
function touchSlop(object, zoom) {
  const x = Math.max(0, (MIN_TARGET_PX - object.w * zoom) / 2)
  const y = Math.max(0, (MIN_TARGET_PX - object.h * zoom) / 2)
  return x || y ? { left: x, right: x, top: y, bottom: y } : undefined
}

/** 회전된 요소 상자 밖의 점에서 상자까지의 거리 (안이면 0) */
function distanceToObject(object, point) {
  const c = centerOf(object)
  const local = rotateVector(point.x - c.x, point.y - c.y, -object.rotation)
  return Math.hypot(Math.max(Math.abs(local.x) - object.w / 2, 0), Math.max(Math.abs(local.y) - object.h / 2, 0))
}

/** maxDistance 안에서 가장 가까운 요소. 거리가 같으면 위(앞)에 있는 요소 */
function nearestObject(objects, point, maxDistance) {
  let best = null
  let bestDistance = maxDistance
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    const d = distanceToObject(objects[i], point)
    if (d < bestDistance - 0.01 || (d <= bestDistance && !best)) {
      best = objects[i]
      bestDistance = d
    }
  }
  return best
}

/** 회전된 요소 상자 안에 점이 있는지 */
function containsPoint(object, point) {
  const c = centerOf(object)
  const local = rotateVector(point.x - c.x, point.y - c.y, -object.rotation)
  return Math.abs(local.x) <= object.w / 2 && Math.abs(local.y) <= object.h / 2
}

const FADE_WHILE_DRAGGING = ['sticker', 'tape', 'photo']
// 텍스트: 한 번 누르면 선택, 선택된 채 다시 누르거나 두 번 빠르게 누르면(더블 탭) 내용 수정
// 사진·이미지 테이프: 더블 탭으로 자르기 (여러 칸 틀은 누른 칸을 채우거나 자른다)
const DOUBLE_TAP_MS = 350
const lastTextTap = { id: null, time: 0 }
/** 더블 탭으로 고칠 그림이 있는 요소 (선택 바의 '자르기' · '사진 채우기'와 같은 대상) */
const editsMedia = (object) => object.type === 'photo' || (object.type === 'tape' && (object.src || object.mediaFileId) && object.imageWidth)
/** 이 요소를 방금 전에도 눌렀으면 true (더블 탭) */
function isDoubleTap(id) {
  const now = Date.now()
  const double = lastTextTap.id === id && now - lastTextTap.time < DOUBLE_TAP_MS
  lastTextTap.id = double ? null : id
  lastTextTap.time = now
  return double
}

// 지우기 미리보기는 터치·도구·선택 층을 다시 렌더하지 않고 그림 층에서만 갱신한다.
const EraserPreviewDrawing = forwardRef(function EraserPreviewDrawing({ page, activeTool, textEditingId, ...props }, ref) {
  const [preview, setPreview] = useState({ ids: [], pieces: null })
  const ticket = useRef(null)
  const fastEraseObjects = useRef(new WeakSet())
  useImperativeHandle(ref, () => ({ preview(ids, pieces, measurement) { ticket.current = measurement; setPreview({ ids, pieces }) } }), [])
  useLayoutEffect(() => {
    const current = ticket.current
    if (current && !current.committed) { current.committed = true; current.measurement.record(current.metric ?? 'eraserPreviewToLayoutMs', current.measurement.clock() - current.started) }
  })
  const ids = [...(activeTool === 'eraser' ? preview.ids : []), ...(textEditingId ? [textEditingId] : [])]
  const pieces = activeTool === 'eraser' ? preview.pieces : null
  const areaPreviewObjects = useMemo(() => {
    if (Platform.OS === 'web' && pieces) for (const object of Object.values(pieces).flat()) fastEraseObjects.current.add(object)
    return Platform.OS === 'web' && pieces ? new Set(Object.values(pieces).flat()) : null
  }, [pieces])
  const uncachedObjects = useMemo(() => Platform.OS !== 'web' && pieces ? new Set(Object.values(pieces).flat()) : null, [pieces])
  const drawingPage = eraserPreviewPage(page, ids, pieces)
  return <ProgressiveCanvasDrawing {...props} page={drawingPage} deferredAreaObjects={fastEraseObjects.current} areaErasing={Boolean(pieces)} areaPreviewObjects={areaPreviewObjects} uncachedObjects={uncachedObjects} />
})

// 페이지 내용이 조금씩 준비될 때 Canvas 전체 대신 표시 층만 갱신한다.
function ProgressiveCanvasDrawing({ page, enabled, generation, onReady, ...props }) {
  const progress = useProgressiveNativePage(page, enabled)
  const displayed = useMemo(() => progress.ready ? page : { ...page, objects: page.objects.slice(0, progress.count) }, [page, progress.ready, progress.count])
  useLayoutEffect(() => {
    if (enabled && progress.ready) onReady({ id: page.id, generation })
  }, [page.id, generation, enabled, progress.ready, onReady])
  return <StaticPage {...props} page={displayed} />
}

function CanvasObject({ object, objects, pageWidth: PAGE_WIDTH, pageHeight: PAGE_HEIGHT, zoom, selectedIds, cropping, isCropTarget, dispatch, onGuides, onInteracting, onDragging, onEditText, onEditMedia, onEditFrameText, directEdit = false }) {
  const gesture = useRef(null)
  const moveFrame = useRef(null)
  const pendingPatches = useRef(null)
  const flushMove = () => {
    if (moveFrame.current) cancelFrame(moveFrame.current)
    moveFrame.current = null
    const patches = pendingPatches.current
    pendingPatches.current = null
    if (patches) dispatch({ type: 'updateMany', patches })
  }
  const queueMove = (patches) => {
    pendingPatches.current = patches
    if (moveFrame.current) return
    moveFrame.current = requestFrame(flushMove)
  }
  useEffect(() => () => {
    if (moveFrame.current) cancelFrame(moveFrame.current)
  }, [])

  const panHandlers = usePan({
    disabled: cropping && !isCropTarget,
    onStart: (event) => {
      onInteracting(true)
      if (isCropTarget) {
        gesture.current = { mode: 'crop', crop: object.crop }
        return
      }
      // Shift·Ctrl+클릭은 이동 없이 선택에 넣거나 뺀다.
      if (isMultiSelectKey()) {
        gesture.current = { mode: 'toggle' }
        dispatch({ type: 'toggleSelect', id: object.id })
        return
      }
      // 그룹 안에 들어가 있는 중(같은 그룹 요소 하나만 선택)이면 형제 요소도 하나씩 고른다.
      const members = object.groupId ? objects.filter((o) => o.groupId === object.groupId).map((o) => o.id) : []
      const insideGroup = members.length > 1 && selectedIds.length === 1 && members.includes(selectedIds[0])
      // 누른 자리에 겹쳐 있는 요소들(위에서부터). 이미 선택된 요소가 그 아래에 있으면 그 요소를 잡는다.
      const point = pagePoint(object, event, zoom)
      const stack = [...objects].reverse().filter((o) => !o.hidden && (o.type !== 'stroke' || selectedIds.includes(o.id)) && containsPoint(o, point))
      const underneath = stack.find((o) => o.id !== object.id && selectedIds.includes(o.id))
      const wasSelected = selectedIds.includes(object.id) || Boolean(underneath)
      const ids = wasSelected ? selectedIds : insideGroup ? [object.id] : expandGroups(objects, [object.id])
      const moving = objects.filter((o) => ids.includes(o.id) && !o.locked && !o.hidden)
      gesture.current = {
        mode: 'move',
        wasSelected,
        groupSelected:
          members.length > 1 && members.every((id) => selectedIds.includes(id)) && selectedIds.length === members.length,
        previousSelection: selectedIds,
        starts: Object.fromEntries(moving.map((o) => [o.id, { x: o.x, y: o.y }])),
        bounds: moving.length ? unionBounds(moving) : null,
        others: objects.filter((o) => !ids.includes(o.id) && !o.hidden),
        checkpointed: false,
        stack,
        // 누른 자리 (요소 안 좌표, 회전 전). 여러 칸 틀에서 몇 번째 칸인지 고를 때 쓴다.
        local: { x: event.locationX / zoom, y: event.locationY / zoom },
      }
      if (!wasSelected) dispatch({ type: insideGroup ? 'selectExact' : 'select', ids: [object.id] })
    },
    onMove: (dx, dy) => {
      const g = gesture.current
      if (!g) return
      if (g.mode === 'toggle') return
      if (g.mode === 'crop') {
        panCrop(object, g.crop, dx, dy, zoom, dispatch)
        return
      }
      if (!g.bounds || Math.hypot(dx, dy) < 3) return
      if (!g.checkpointed) {
        dispatch({ type: 'checkpoint' })
        g.checkpointed = true
        onDragging?.(objects.filter((o) => g.starts[o.id] && FADE_WHILE_DRAGGING.includes(o.type)).map((o) => o.id))
      }
      let ox = dx / zoom
      let oy = dy / zoom
      const threshold = SNAP_SCREEN_PX / zoom
      const cx = g.bounds.cx + ox
      const cy = g.bounds.cy + oy
      const guideX = nearest([PAGE_WIDTH / 2, ...g.others.map((o) => centerOf(o).x)], cx, threshold)
      const guideY = nearest([PAGE_HEIGHT / 2, ...g.others.map((o) => centerOf(o).y)], cy, threshold)
      if (guideX != null) ox += guideX - cx
      if (guideY != null) oy += guideY - cy
      onGuides(guideX == null && guideY == null ? null : { x: guideX, y: guideY })
      const patches = Object.fromEntries(Object.entries(g.starts).map(([id, s]) => [id, { x: s.x + ox, y: s.y + oy }]))
      queueMove(patches)
    },
    onEnd: ({ moved, duration, cancelled }) => {
      const g = gesture.current
      gesture.current = null
      if (g?.mode === 'move') flushMove()
      onGuides(null)
      onInteracting(false)
      onDragging?.(null)
      // 끄는 도중 두 번째 손가락이 닿아 화면 확대·이동으로 넘어가면, 옮기던 요소는 제자리로 돌린다.
      if (cancelled) {
        if (g?.checkpointed) dispatch({ type: 'revertToCheckpoint' })
        return
      }
      if(g?.checkpointed) dispatch({type:'commitCheckpoint'})
      // 움직이지 않고 길게 누르면 누르기 전 선택에 이 요소를 넣거나 뺀다.
      if (g?.mode === 'move' && !moved && duration >= LONG_PRESS_MS) {
        dispatch({ type: 'select', ids: g.previousSelection })
        dispatch({ type: 'toggleSelect', id: object.id })
        return
      }
      // 속지 목록의 할 일 글은 한 번 누르면 바로 고친다. (끌면 이동, 길게 누르면 선택에 넣고 뺀다)
      if (g?.mode === 'move' && !moved && directEdit && !object.locked) {
        onEditText(object)
        return
      }
      // 이미 선택된 그룹을 한 번 더 탭하면 그 요소만 골라 따로 고칠 수 있다. (빈 곳을 누르면 다시 그룹 단위)
      if (g?.mode === 'move' && !moved && g.groupSelected) {
        dispatch({ type: 'selectExact', ids: [object.id] })
        return
      }
      // 텍스트 더블 탭은 겹친 요소가 있어도 바로 수정한다.
      if (g?.mode === 'move' && !moved && ['text', 'shape'].includes(object.type) && !object.locked && isDoubleTap(object.id)) {
        onEditText(object)
        return
      }
      // 사진 더블 탭: 틀에 인쇄된 글자 자리면 그 글자를 고치고, 아니면 사진(칸)을 고친다.
      if (g?.mode === 'move' && !moved && editsMedia(object) && !object.locked && isDoubleTap(object.id)) {
        const line = object.type === 'photo' && onEditFrameText ? frameTextAt(object, g.local.x, g.local.y) : -1
        if (line >= 0) onEditFrameText(object, line)
        else onEditMedia?.(object, isStripFrame(object.frame) ? stripCellAt(object, g.local.x, g.local.y) : null)
        return
      }
      // 겹침이 없는 선택 텍스트는 재탭으로 편집한다. 겹친 요소의 순환 선택은 유지한다.
      if (g?.mode === 'move' && !moved && g.wasSelected && g.stack.length === 1 && object.type === 'text' && !object.locked) {
        onEditText(object)
        return
      }
      // 겹친 자리에서 선택된 요소를 한 번 더 탭하면 그 아래 요소 → 그 아래 → … → 다시 맨 위 순서로 고른다.
      if (g?.mode === 'move' && !moved && g.wasSelected && g.stack.length > 1) {
        const current = g.stack.findIndex((o) => g.previousSelection.includes(o.id))
        for (let step = 1; step < g.stack.length; step += 1) {
          const next = g.stack[(current + step) % g.stack.length]
          // 같은 묶음(그룹) 안의 요소는 건너뛴다.
          if (!g.previousSelection.includes(next.id)) {
            dispatch({ type: 'select', ids: [next.id] })
            break
          }
        }
      }
    },
  })

  // 보이는 모습은 그림 층이 그린다. 여기는 같은 자리·각도의 투명한 터치 상자다.
  return (
    <View
      {...panHandlers}
      // 작은 요소도 손가락으로 잡기 쉽게 터치 영역을 최소 MIN_TARGET_PX 로 넓힌다 (Android·iOS)
      hitSlop={touchSlop(object, zoom)}
      style={{
        position: 'absolute',
        left: object.x * zoom,
        top: object.y * zoom,
        width: object.w * zoom,
        height: object.h * zoom,
        transform: [{ rotate: `${object.rotation}deg` }],
      }}
    />
  )
}

/** 자르기 중 드래그: 사진 안에서 보이는 위치(fx, fy)를 옮긴다. */
function panCrop(photo, startCrop, dx, dy, zoom, dispatch) {
  const inner = photoInnerBox(photo)
  const layout = coverLayout({ ...photo, crop: startCrop }, inner.width * zoom, inner.height * zoom)
  const local = rotateVector(dx, dy, -photo.rotation)
  const direction = photo.flipX ? -1 : 1
  const overflowX = layout.width - inner.width * zoom
  const overflowY = layout.height - inner.height * zoom
  const crop = {
    ...startCrop,
    fx: overflowX > 0 ? clamp(startCrop.fx - (local.x * direction) / overflowX, 0, 1) : startCrop.fx,
    fy: overflowY > 0 ? clamp(startCrop.fy - local.y / overflowY, 0, 1) : startCrop.fy,
  }
  dispatch({ type: 'updateObject', id: photo.id, patch: { crop } })
}

const styles = StyleSheet.create({
  pageLoading: { position: 'absolute', top: 12, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.lg, backgroundColor: colors.surface },
  pageLoadingText: { fontSize: 12.5, fontWeight: '600', lineHeight: 19, color: colors.textMuted },
  drawingSurface: Platform.select({ web: {
    userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', WebkitTapHighlightColor: 'transparent',
  }, default: {} }),
  page: {
    // 웹 터치: 페이지 위 드래그를 브라우저가 스크롤·뒤로 가기 스와이프로 가져가지 않게 한다. (영역 선택·이동용)
    ...Platform.select({ web: { touchAction: 'none' }, default: {} }),
    backgroundColor: colors.surface,
    // 테두리 선은 두지 않는다: 태블릿에서 종이 위쪽에 회색 띠처럼 보였다. 종이와 바탕은 그림자로 구분한다.
    shadowColor: colors.text,
    // 캔버스 그림자는 0 6 16 / 6% 만(코덱스 안)
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  clip: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
  },
  // 요소마다 같은 자리에 터치 상자를 두는 층. 층 자체는 높이 0 으로 둔다(상자들은 절대 위치라 그대로 눌린다).
  // 캔버스 전체를 덮으면 안드로이드에서 box-none 이어도 아래 텍스트 상자 만들기 층(TextBoxInput)이 탭을 받지 못한다.
  // 층 밖으로 나간 상자도 눌리는 것은 overflow 가 visible 일 때뿐이라 명시해 둔다(안드로이드 터치 대상 검색 · iOS RCTView hitTest 는
  // 자르지 않는 뷰면 영역 밖 자식도 찾고, 웹은 DOM 이 원래 그렇다). hidden 으로 바꾸지 않는다.
  hitLayer: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'visible' },
  emptyMenu: { position: 'absolute', zIndex: 6, flexDirection: 'row', justifyContent: 'space-between', padding: 4, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(129,138,195,0.2)', boxShadow: '0px 6px 14px rgba(11, 23, 102, 0.16)' },
  menuButton: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 42, paddingHorizontal: 10, borderRadius: 11 },
  menuPressed: {}, // 눌림 효과 없음(사용자 지시)
  menuDisabled: { opacity: DISABLED_OPACITY },
  menuText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  selectionControls: { ...StyleSheet.absoluteFill, zIndex: 2 },
  selectionMenu: { ...StyleSheet.absoluteFill, zIndex: 4 },
  penClip: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  guideV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 0,
    borderLeftWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  guideH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  // 영역 선택 중 걸린 요소 표시: 선택 테두리와 같은 모양(채우지 않은 1.5 실선, 요소 바로 바깥)
  hit: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  marquee: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: 4,
    backgroundColor: 'rgba(129,138,195,0.12)',
  },
  groupFrame: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: 12,
  },
  groupFrameInside: { borderWidth: 1.5, borderColor: 'rgba(129,138,195,0.55)' },
  groupLabel: {
    position: 'absolute',
    top: -26,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.primaryStrong,
    color: colors.surface,
    fontSize: 11,
    fontWeight: '700',
  },
  angleBadge: {
    borderRadius: 16,
    position: 'absolute',
    width: 68,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text,
  },
  angleText: { color: colors.surface, fontSize: 13, fontWeight: '700' },
})
