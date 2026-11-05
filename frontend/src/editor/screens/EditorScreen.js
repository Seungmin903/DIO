import { usePhotoPanel, discardUnusedPhotoImports } from '../hooks/usePhotoPanel'
import PhotoSourcePicker from '../components/panels/PhotoSourcePicker'
import { canLeaveForInvitation } from '../../notifications/editorInvitationGuard';
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Animated, BackHandler, Easing, Keyboard, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { colors, shadow, DISABLED_OPACITY } from '../../shared/theme'
import DioButton from '../../shared/DioButton'
import MediaNotice from '../components/MediaNotice'
import { mediaFailureMessage } from '../utils/mediaRecovery.js'
import { createRegionExportSnapshot } from '../utils/regionExport.js'
import RegionExportSelector from '../components/RegionExportSelector'
import ExportMenu from '../components/ExportMenu'
import PageExportPreview from '../components/PageExportPreview'
import ExportRunner from '../components/ExportRunner'
import { createExportSnapshot } from '../utils/pageExport.js'
import { pngFileName } from '../utils/pngFileSave.js'
import Canvas from '../components/canvas/Canvas'
import { CompactMenu, placeCompactMenu } from '../components/canvas/ContextBar'
import PhotoCropper from '../components/panels/PhotoCropper'
import DecorDrawer from '../components/panels/DecorDrawer'
import Icon from '../components/controls/Icon'
import LayerPanel, { LAYER_PANEL_COMPACT_WIDTH, LAYER_PANEL_WIDTH } from '../components/panels/LayerPanel'
import MorePanel from '../components/panels/MorePanel'
import PageList, { PAGE_LIST_WIDTH, pageListFrame } from '../components/panels/PageList'
import PageSettingsDialog from '../components/panels/PageSettingsDialog'
import PagePanelVisibility from '../components/panels/PagePanelVisibility'
import { createThumbnailWorkQueue } from '../utils/thumbnailWorkQueue.js'
import { createPageCloseScheduler } from '../utils/pageCloseScheduler.js'
import { editorPanelLayout } from '../utils/panelLayout.js'
import Ribbon from '../components/chrome/Ribbon'
import PhoneSheet from '../components/chrome/PhoneSheet'
import PhoneSidePanel from '../components/chrome/PhoneSidePanel'
import PhoneCornerButtons from '../components/chrome/PhoneCornerButtons'
import PhoneToolbar, { PHONE_TOOLBAR_RAIL, PhoneEditorRail } from '../components/chrome/PhoneToolbar'
import PresetColorEditor from '../../diary/components/PresetColorEditor'
import PenSettings from '../components/PenSettings'
import { shapeTextSettings, shapeTextFormatPatch } from '../utils/editorShapes'
import EraserSettings from '../components/EraserSettings'
import { normalizePaperAppearance } from '../templates/appearance.js'
import { newPageAppearance } from '../templates/newPageAppearance.js'
import { loadDefaultPaperStyle } from '../../diary/hooks/useDefaultPaperStyle'
import useMyLibrary from '../../diary/hooks/useMyLibrary'
import { pdfDocPage } from '../../diary/utils/pdfImport.js'
import { ERASER_RADIUS } from '../utils/eraser.js'
import LassoSettings from '../components/LassoSettings'
import TextSettings from '../components/TextSettings'
import TextLinkDialog from '../components/TextLinkDialog'
import GuideSettings from '../components/GuideSettings'
import PageOverview from '../components/panels/PageOverview'
import { DEFAULT_GUIDES, hasGuides } from '../components/canvas/GridOverlay'
import { TEXT_ACTION_BAR_HEIGHT, TEXT_ACTION_BAR_WIDTH } from '../components/TextActionBar'
import { keyboardPanelBottom } from '../utils/textKeyboard'
import { formatTextRange } from '../utils/textFormats'
import { copyText } from '../services/textClipboard'
import { objectClipboard, useObjectClipboard } from '../services/objectClipboard'
import { DEFAULT_TEXT_SETTINGS, textSettings, textFormatPatch, VISUAL_TEXT_KEYS } from '../utils/text'
import { createText } from '../utils/text'
import { DEFAULT_HIGHLIGHTER_SETTINGS } from '../utils/penSettings'
import { usePenSettings } from '../hooks/usePenSettings'
import { recordPenColorUse } from '../hooks/useRecentPenColors'
import { useDrawingInput } from '../../shared/drawingInput'
import { useReadingPreviews } from '../hooks/useReadingPreviews'
import { useToolPreference } from '../utils/toolPreferences'
import SaveIndicator from '../components/controls/SaveIndicator'
import TapeCropper from '../components/panels/TapeCropper'
import TapCatcher from '../components/controls/TapCatcher'
import TopBar from '../components/chrome/TopBar'
import Viewport from '../components/canvas/Viewport'
import { ReadingHeader, ReadingNavigation, ReadingModeControls, READING_PADDING, READING_PADDING_FULL } from '../components/chrome/ReadingChrome'
import { StageOverlayHost } from '../components/canvas/StageOverlay'
import { ViewportMotion } from '../components/canvas/StaticPage'
import ReadingPageTurn from '../components/canvas/ReadingPageTurn'
import { readingEdgeMessage, turnLift, turnProgress, turnShouldComplete } from '../utils/pageTurn.js'
import { PHONE_ZOOM_MAX, ZOOM_MAX, ZOOM_MIN } from '../constants'
import { useEditor } from '../hooks/useEditor'
import { useMemberCanvasCollaboration } from '../hooks/useMemberCanvasCollaboration'
import { useMemberPagePosition } from '../hooks/useMemberPagePosition'
import { prefetchPageTemplate } from '../services/editorDocs'
import { getCurrentPage } from '../state/editorReducer'
import { clamp, createId, unionBounds } from '../utils/common'
import { OPTIONS_TOP, OPTIONS_TOP_PHONE, OPTIONS_WIDTH, optionsPlacement, tabletToolPopover } from '../utils/toolPanelPlacement'
import { automaticPageTurn, centeredOffset, clampOffset as clampViewportOffset, isFitView, panView } from '../utils/viewport.js'
import { pickImages } from '../services/image'
import { MEDIA_POLICY } from '../utils/mediaPolicy.js'
import { discardGeneratedMedia } from '../services/mediaStore'
import { createObjectFromDecor, emptyPhotoSlots, hasPhotoMedia, photoInnerBox, tapePieceRatio } from '../utils/objects'
import { isTicketFrame } from '../components/canvas/PhotoFrame'
import { isStripFrame, photoCell, stripCellBoxes } from '../utils/photoStrip'
import { startPagePanelMeasurement } from '../utils/pagePanelPerformance.js'

import PageAddPicker, { prefetchPageAddPapers } from '../components/PageAddPicker'
import { pageSize, pageTemplateOrientation } from '../utils/pageGeometry.js'

const TOAST_MS = 2000
const PAGES_LOADING_MESSAGE = '페이지를 모두 불러온 뒤 다시 시도해 주세요.'
// 태블릿·폰의 내보내기 진입. 정책 결정으로 다시 켰다 (false 로 바꾸면 모든 진입을 숨긴다).
const exportEnabled = true
// 태블릿: 페이지를 작업창에 최대한 크게 띄운다(사용자 결정). 되돌리기 · 맞춤 막대는 페이지 위에 겹칠 수 있다
const STAGE_PADDING = { top: 8, bottom: 8, side: 8 }
// 폰: 도구 막대가 작업창 밖(위·오른쪽)에 있어서 스테이지에는 되돌리기 바 여백만 남긴다.
const PHONE_STAGE_PADDING = { top: 24, bottom: 68, side: 12 } // 도구 막대 아래 여백 24(코덱스 안)

// 상위 보관함에서 대상 다이어리와 읽기 전용 여부를 전달한다.
// compact: 폰 배치(패널은 기본으로 닫고 작업창 위에 띄움). 세로는 간편 편집(상단 바 + 상단 도구 막대),
// 가로는 정밀 편집(왼쪽 화면 막대 + 오른쪽 전체 도구 막대 + 확대·축소). onToggleOrientation이 있으면 세로·가로를 버튼으로 바꾼다.
/** 여러 칸 틀의 칸 하나를 자르기 창에 넘길 사진 모양 (칸 크기의 사각 사진). 빈 칸이면 null */
// 비율이 정해진 사진: 여러 칸 틀의 칸 · 티켓 틀(글자 자리가 정해져 있다)
const fixedAspectOf = (photo) => (photo.cell != null ? photo.w / photo.h : isTicketFrame(photo.frame) ? photoInnerBox(photo).width / photoInnerBox(photo).height : undefined)

function cellCropPhoto(strip, index) {
  const cell = strip.cells?.[index]
  const box = stripCellBoxes(strip)[index]
  return cell && box ? { ...cell, id: `${strip.id}:${index}`, cell: index, x: 0, y: 0, w: box.width, h: box.height, frame: 'shape', shape: 'rect' } : null
}

export default function EditorScreen({ registerInvitationLeaveGuard, sharingMembers = [], onOpenSharing, invitationCount = 0, onHome, onRenameDiary, diary, readOnly: permissionReadOnly = false, onRegionExport, compact = false, landscape = false, bottomInset = 0, onToggleOrientation, tabs, onSelectTab, onCloseTab, fixedViewportZoom = null, qaController = null, backDisabled = false }) {
  const [readingMode, setReadingMode] = useState(false)
  const [readerMenuVisible, setReaderMenuVisible] = useState(true)
  const readOnly = permissionReadOnly || readingMode
  const textCommitRef = useRef(null)
  const readingLinkRef = useRef(false)
  const modeControlsRef = useRef(null)
  const modeControlsBounds = useRef(null)
  useEffect(() => { setReadingMode(false); setReaderMenuVisible(true) }, [diary?.id])
  // loaded 전에는 저장 문서가 아니라 임시 기본 문서라서 속지·썸네일을 그리지 않는다.
  const qaHistoryExecutions = useRef(0)
  const { state, dispatch, saveStatus, loaded, setInputActive } = useEditor(diary)
  // 내용을 불러온 뒤 상단바 · 패널 폭이 한 번 더 바뀐다. 측정이 잠잠해지면 페이지를 처음 그린다(그 뒤로는 그대로 둔다)
  const [pageReady, setPageReady] = useState(false)
  const page = getCurrentPage(state)
  // 앨범을 고르는 동안 동기화로 바뀐 내용을 덮지 않게, await 뒤에는 이 최신 페이지를 읽는다
  const pageNow = useRef(page)
  pageNow.current = page
  useMemberPagePosition({ diary, pageId: page.id, loaded: loaded && saveStatus !== 'load-error' })
  const textSync = useMemberCanvasCollaboration({ diary, page, state, loaded: loaded && saveStatus !== 'load-error', readOnly: permissionReadOnly, dispatch })
  const localUndo=state.past.length>0&&!state.collaborationPast?.at(-1)?.hasCanvas
  const localRedo=state.future.length>0&&!state.collaborationFuture?.[0]?.hasCanvas
  // 페이지 목록·레이어는 캔버스를 먼저 그린 뒤 따라 그린다 (지우개·이동을 끝내고 손을 뗄 때 한꺼번에 다시 그려 멈칫하던 것)
  const deferredPages = useDeferredValue(state.doc.pages)
  const deferredObjects = useDeferredValue(page.objects)
  const { width: PAGE_WIDTH, height: PAGE_HEIGHT } = pageSize(page)
  const templateOrientation = pageTemplateOrientation(state.doc, page)
  const myLibrary = useMyLibrary()
  // 페이지 추가 팝업의 속지(줄 · 모눈 · 도트 …)를 미리 불러 둬 열자마자 그려지게 한다
  // (편집 화면이 자리 잡은 뒤에 불러 와 첫 화면을 막지 않는다)
  useEffect(() => {
    const timer = setTimeout(() => prefetchPageAddPapers(templateOrientation), 1500)
    return () => clearTimeout(timer)
  }, [templateOrientation])
  // 앞뒤 페이지 속지를 미리 해석해 두어 페이지를 넘길 때 빈 속지가 보이지 않게 한다.
  // 필기마다 pages 배열이 바뀌므로, 앞뒤 페이지의 속지가 바뀔 때만 다시 실행한다.
  const pageIndex = state.doc.pages.findIndex((item) => item.id === page.id)
  const nextPage = state.doc.pages[pageIndex + 1]
  const previousPage = state.doc.pages[pageIndex - 1]
  const neighborTemplates = [nextPage, previousPage].map((item) => (item ? `${item.backgroundAssetId}@${item.templateVersion}` : '')).join('|')
  const neighborsRef = useRef([nextPage, previousPage])
  neighborsRef.current = [nextPage, previousPage]
  useEffect(() => {
    const timer = setTimeout(() => neighborsRef.current.forEach(prefetchPageTemplate), 300)
    return () => clearTimeout(timer)
  }, [neighborTemplates])
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)

  const [exportSnapshot, setExportSnapshot] = useState(null)
  // 화면 없이 진행하는 내보내기 (ExportRunner). 진행률은 아래쪽 작은 알림으로 보여 준다
  const [exportJob, setExportJob] = useState(null)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportAnchor, setExportAnchor] = useState(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [regionOpen, setRegionOpen] = useState(false)
  const [stageSize, setStageSize] = useState(null)
  const [viewMoving, setViewMoving] = useState(false) // 확대·이동 중 (그동안 GIF 를 멈춘다)
  const stageRef = useRef(null)
  const [toolAnchor, setToolAnchor] = useState(null)
  const [drawerWidth, setDrawerWidth] = useState(320)
  const [stageOrigin, setStageOrigin] = useState({ x: 0, y: 0 })
  // 키보드 위쪽 끝(화면 y). 안드로이드 전체 화면(edge-to-edge)은 키보드가 떠도 작업 영역이 줄지 않아, '선택한 글자' 줄을 이 위에 직접 놓는다
  const [keyboardTop, setKeyboardTop] = useState(null)
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => setKeyboardTop(event.endCoordinates?.screenY ?? null))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardTop(null))
    return () => { show.remove(); hide.remove() }
  }, [])
  const [sheetHeight, setSheetHeight] = useState(0) // 폰 세로 하단 시트가 열려 있으면 그 높이(되돌리기 막대를 시트 위로 올린다)
  const [phonePanelWidths, setPhonePanelWidths] = useState({ left: 0, right: 0 }) // 폰에서 작업창 위에 띄운 패널 너비
  const toolPopoverStyle = (width = 320) => {
    // 폰: 세로 리본 바로 아래, 가로 리본의 상단 옆에 설정 창을 붙인다.
    // 작업 영역 안에서만 펼쳐지게 해 하단 되돌리기 바도 가리지 않는다.
    if (compact) return { left: 8, right: 8, top: 8, bottom: 60, alignItems: landscape ? 'flex-end' : 'center', justifyContent: 'flex-start' }
    return tabletToolPopover({ width, anchor: toolAnchor, stageOrigin, stageWidth: stageSize?.width })
  }

  // scale: 화면에 맞춤 대비 배율, x·y: 페이지 왼쪽 위 위치 (null 이면 가운데)
  const [view, setView] = useState({ scale: 1, x: null, y: null })
  const [drawerTab, setDrawerTab] = useState(null)
  // 편집 화면은 선택 도구로 시작한다(바로 요소를 눌러 고를 수 있게). 화면 이동은 손바닥 · 두 손가락으로 한다.
  const [activeTool, setActiveTool] = useState(() => qaController?.initialTool === 'pen' ? 'pen' : 'select')
  const drawingInput = useDrawingInput()
  // 손바닥 도구로 페이지를 길게 누른 자리 (캔버스가 빈 곳 메뉴를 띄운다)
  const [pageMenuRequest, setPageMenuRequest] = useState(null)
  useEffect(() => { setPageMenuRequest(null) }, [page.id, activeTool])
  const [lassoSettingsOpen, setLassoSettingsOpen] = useState(false)
  // 올가미 모양은 기기에 기억하고(다른 도구를 갔다 와도 그대로), 더하기 · 빼기 모드만 올가미를 쓸 때마다 처음으로 돌아간다
  const [lassoShape, setLassoShape] = useToolPreference('lassoShape', 'rectangle')
  const [lassoMode, setLassoMode] = useState('replace')
  const lasso = useMemo(() => ({ shape: lassoShape, mode: lassoMode }), [lassoShape, lassoMode])
  const setLasso = useCallback(update => {
    const next = typeof update === 'function' ? update(lasso) : update
    setLassoMode(next.mode)
    if (next.shape !== lassoShape) setLassoShape(next.shape)
  }, [lasso, lassoShape, setLassoShape])
  useEffect(() => { setLasso(current => ({ ...current, mode: 'replace' })) }, [page.id])
  const [textEditing, setTextEditing] = useState(null)
  // 데일리 플래너 할 일을 펜 · 형광펜으로 눌러 쓴 경우, 글 입력을 마치면 그 도구로 돌아간다(그 밖에는 선택 도구)
  const textReturnTool = useRef(null)
  const returnableTool = (tool) => (tool === 'pen' || tool === 'highlighter' ? tool : null)
  // 글 입력이 저장 · 취소 · 그 밖의 어떤 경로로 끝나도 돌아갈 도구를 비워, 다음 입력(도형 글 등)이 옛 도구로 돌아가지 않게 한다.
  useEffect(() => { if (!textEditing) textReturnTool.current = null }, [textEditing])
  // 사진 틀(티켓 · 네컷)의 인쇄 글자를 캔버스에서 바로 고치는 중 { pageId, id, line }
  const [frameTextEdit, setFrameTextEdit] = useState(null)
  const textBoundary = useRef(null)
  const textPaletteBounds = useRef(null)
  const [textPalette, setTextPalette] = useState(null)
  const [textDefaults, setTextDefaults] = useToolPreference('textDefaults', DEFAULT_TEXT_SETTINGS)
  const [textSettingsOpen, setTextSettingsOpen] = useState(false)
  const [textLinkTarget, setTextLinkTarget] = useState(null)
  const [objectLinkTarget, setObjectLinkTarget] = useState(null) // 링크를 거는 중인 스티커·테이프·사진
  const [linkBadges, setLinkBadges] = useState(true) // 링크가 걸린 요소에 배지를 보일지 (링크 창 오른쪽 위 스위치)
  const [guides, setGuides] = useToolPreference('guides', DEFAULT_GUIDES) // 격자·보조선 (화면에만 보인다, 기기에 기억)
  const [guidesOpen, setGuidesOpen] = useState(false)
  const [overviewFilter, setOverviewFilter] = useState(null) // 페이지 넓게 보기: 'all' | 'bookmarked' (null 이면 닫힘)
  const [penSettings, setPenSettings] = usePenSettings()
  const [colorPicker, setColorPicker] = useState(null)
  const colorScreen = useWindowDimensions()
  const [highlighterSettings, setHighlighterSettings] = useToolPreference('highlighter', DEFAULT_HIGHLIGHTER_SETTINGS)
  const [straightAssist, setStraightAssist] = useToolPreference('straightAssist', true)
  const [eraserSize, setEraserSize] = useToolPreference('eraserSize', ERASER_RADIUS * 2)
  const [eraserTarget, setEraserTarget] = useToolPreference('eraserTarget', 'all')
  const [eraserMode, setEraserMode] = useToolPreference('eraserMode', 'stroke') // 획 지우기 | 영역 지우기
  const [penSettingsOpen, setPenSettingsOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  // 좁은 창과 세로 태블릿은 작업 영역 확보를 위해 패널을 닫고 시작한다.
  const [compactMenu, setCompactMenu] = useState(null)
  const panelLayout = editorPanelLayout(colorScreen.width, compact, landscape)
  const [layersOpen, setLayersOpen] = useState(panelLayout.initialOpen)
  // 태블릿 레이어 창 폭: 상단바 오른쪽 묶음(공유 · 레이어 · 내보내기) 폭과 같게 해 왼쪽 끝을 공유 버튼에 맞춘다
  const [layerWidth, setLayerWidth] = useState(LAYER_PANEL_WIDTH)
  const [pagesOpen, setPagesOpen] = useState(panelLayout.initialOpen)
  const [settingsPageId, setSettingsPageId] = useState(null)
  useEffect(() => { setSettingsPageId(null) }, [diary?.id, readOnly])
  useEffect(() => { if (settingsPageId && !state.doc.pages.some(p => p.id === settingsPageId)) setSettingsPageId(null) }, [settingsPageId, state.doc.pages])
  const thumbnailWork = useRef(null)
  if (!thumbnailWork.current) thumbnailWork.current = createThumbnailWorkQueue()
  useEffect(() => () => thumbnailWork.current?.clear(), [])
  const [pagesClosing, setPagesClosing] = useState(false)
  const pageCloseScheduler = useRef(null)
  if (!pageCloseScheduler.current) pageCloseScheduler.current = createPageCloseScheduler()
  const cancelPageClose = () => pageCloseScheduler.current.cancel()
  useEffect(() => () => cancelPageClose(), [])
  const pagePanelMeasurement = useRef(null)
  const toolChangeMeasurement = useRef(null)
  const pageSelectMeasurement = useRef(null)
  useEffect(() => () => { pagePanelMeasurement.current?.dispose(); toolChangeMeasurement.current?.dispose(); pageSelectMeasurement.current?.dispose() }, [])
  useLayoutEffect(() => { toolChangeMeasurement.current?.emit('tool-layout', { tool: activeTool }) }, [activeTool])
  useLayoutEffect(() => { pageSelectMeasurement.current?.emit('page-layout', { objects: page.objects.length }) }, [page.id])
  const [layoutCompact, setLayoutCompact] = useState(compact)
  if (layoutCompact !== compact) {
    setLayoutCompact(compact)
    setLayersOpen(false)
    setPagesOpen(false)
  }
  const [singlePanelLayout, setSinglePanelLayout] = useState(panelLayout.singlePanel)
  if (singlePanelLayout !== panelLayout.singlePanel) {
    setSinglePanelLayout(panelLayout.singlePanel)
    if (panelLayout.singlePanel) { setLayersOpen(false); setPagesOpen(false) }
  }
  const [tabletPortrait, setTabletPortrait] = useState(!compact && !landscape)
  if (tabletPortrait !== (!compact && !landscape)) {
    setTabletPortrait(!compact && !landscape)
    if (!compact && !landscape) { setLayersOpen(false); setPagesOpen(false) }
  }
  const stagePadding = readOnly ? (readerMenuVisible ? READING_PADDING : READING_PADDING_FULL) : compact ? PHONE_STAGE_PADDING : STAGE_PADDING
  const [focusMode, setFocusMode] = useState(false)
  // 닫는 두 프레임 사이에 화면 모드가 바뀌면 이전 폭을 더하는 예약을 폐기한다.
  useLayoutEffect(() => {
    if (!pageCloseScheduler.current.pending()) return
    cancelPageClose()
    setPagesClosing(false)
    setPagesOpen(false)
  }, [compact, landscape, readOnly, focusMode, diary?.id])
  const phoneLandscape = compact && landscape
  // 폰 집중 편집: 막대를 모두 숨기고 종료 버튼만 남긴다.
  const phoneFocus = !readOnly && compact && focusMode
  const [cropId, setCropId] = useState(null)
  const [importFailure, setImportFailure] = useState(null)
  const [toast, setToast] = useState(null)
  const [tapeCropId, setTapeCropId] = useState(null) // 다시 자르는 중인 이미지 테이프
  // 사진 넣기 흐름(사진 고르기 → 자르기 · 확대 · 비율 → 붙은 모습)을 모든 사진 자리에서 같게: 붙이기 전에 자르기 창을 띄우고 '적용'한 값으로 넣는다.
  // { photo, fixedAspect, title, resolve } — 취소하면 그 사진은 넣지 않는다(resolve(null))
  const [cropAsk, setCropAsk] = useState(null)
  const askCrop = (photo, title) => new Promise((resolve) => setCropAsk({ photo, fixedAspect: fixedAspectOf(photo), title, resolve }))
  const [photoCropId, setPhotoCropId] = useState(null) // 자르기 창을 연 사진
  useEffect(() => registerInvitationLeaveGuard?.(() => {
    const allowed = canLeaveForInvitation({ loaded, saveStatus, editing: Boolean(textEditing || cropId || tapeCropId || photoCropId) });
    if (!allowed) showToast('입력·자르기와 저장을 마친 뒤 다이어리를 열어 주세요.');
    return allowed;
  }), [registerInvitationLeaveGuard, loaded, saveStatus, textEditing, cropId, tapeCropId, photoCropId]);

  const [photoCropCell, setPhotoCropCell] = useState(null) // 여러 칸 틀이면 자르는 칸 번호
  // 복사한 요소: 다른 페이지·다른 다이어리 탭에도 붙여 넣는다 (services/objectClipboard)
  const copiedObjects = useObjectClipboard()
  // at({ x, y }): 빈 곳을 길게 누른 자리. 주면 복사한 요소들의 가운데를 그 자리에 맞춰 붙인다
  const paste = (at) => {
    const objects = objectClipboard.get()
    if (!objects.length || readOnly) return
    if (at?.x != null) {
      const box = unionBounds(objects)
      const dx = at.x - (box.left + box.right) / 2, dy = at.y - (box.top + box.bottom) / 2
      dispatch({ type: 'pasteObjects', objects: objects.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy })), offset: 0 })
    } else dispatch({ type: 'pasteObjects', objects })
    showToast(`${objects.length}개를 붙여넣었어요.`)
  }

  useEffect(() => {
    if (!readOnly) return
    if (cropId) dispatch({ type: 'revertToCheckpoint' })
    setCropId(null)
    setTapeCropId(null)
    setPhotoCropId(null)
    setFrameTextEdit(null)
    setPagesOpen(false)
    setLayersOpen(false)
    setOverviewFilter(null)
    setTextLinkTarget(null)
    setObjectLinkTarget(null)
    setGuidesOpen(false)
    setTemplatePickerOpen(false)
    setLassoSettingsOpen(false)
    setDrawerTab(null)
    setTextEditing(null)
    setTextSettingsOpen(false)
    setPenSettingsOpen(false)
    setMoreOpen(false)
    dispatch({ type: 'select', ids: [] })
  }, [readOnly, cropId, dispatch])

  const fitZoom = stageSize
    ? Math.max(
        0.05,
        Math.min(
          (stageSize.width - stagePadding.side * 2) / PAGE_WIDTH,
          (stageSize.height - stagePadding.top - stagePadding.bottom) / PAGE_HEIGHT,
        ),
      )
    : 0.6
  // Optional fixed viewport is supplied only by the isolated comparison harness.
  const viewportLocked = Number.isFinite(fixedViewportZoom) && fixedViewportZoom > 0
  const zoom = viewportLocked ? fixedViewportZoom : fitZoom * view.scale
  const offset = viewportLocked || view.x == null ? centeredOffset(stageSize, zoom, PAGE_WIDTH, PAGE_HEIGHT, stagePadding) : { x: view.x, y: view.y }
  // 이미 화면에 맞춰져 있으면 우하단 "화면에 맞춤" 버튼을 비활성화한다 (고정 보기는 옮길 수 없으니 늘 맞춤)
  const viewFitted = viewportLocked || isFitView(view, centeredOffset(stageSize, fitZoom, PAGE_WIDTH, PAGE_HEIGHT, stagePadding))
  const viewportMotion = useMemo(() => ({ moving: viewMoving, visible: stageSize ? { x: -offset.x / zoom, y: -offset.y / zoom, width: stageSize.width / zoom, height: stageSize.height / zoom } : null }),
    [viewMoving, stageSize?.width, stageSize?.height, offset.x, offset.y, zoom])

  // 페이지가 화면 밖으로 다 사라지지 않게 가장자리 80px 은 남긴다.
  const clampOffset = (next, z) => clampViewportOffset(next, z, stageSize, PAGE_WIDTH, PAGE_HEIGHT)
  // pagePoint(페이지 좌표)가 화면의 screenPoint 에 오도록 배율을 바꾼다. (손가락 사이·휠 위치 기준 확대)
  // resolve*: 제한을 적용한 보기 { scale, zoom, x, y } 만 계산한다. 손가락 제스처 중에는 Viewport 가 이것으로 미리 보여 주고 손을 뗄 때 확정한다.
  const maxZoomScale = compact ? PHONE_ZOOM_MAX : ZOOM_MAX
  const resolveZoom = (nextScale, pagePoint, screenPoint) => {
    if (viewportLocked) return { scale: 1, zoom, ...offset }
    const scale = clamp(nextScale, ZOOM_MIN, maxZoomScale)
    const z = fitZoom * scale
    return { scale, zoom: z, ...clampOffset({ x: screenPoint.x - pagePoint.x * z, y: screenPoint.y - pagePoint.y * z }, z) }
  }
  const resolvePan = (from, dx, dy) => viewportLocked ? { scale: 1, zoom, ...offset } : ({ ...from, ...panView(from, dx, dy, fitZoom, stageSize, PAGE_WIDTH, PAGE_HEIGHT, stagePadding) })
  const commitView = (next, motion = {}) => {
    if (viewportLocked) return
    if (readOnly) { setView({ scale: next.scale, x: next.x, y: next.y }); return }
    const turn = automaticPageTurn({
      motion,
      view: next,
      stage: stageSize,
      pageHeight: PAGE_HEIGHT,
      bottomPadding: stagePadding.bottom,
      hasPrevious: Boolean(previousPage),
      hasNext: Boolean(nextPage),
      textEditing,
    })
    if (turn === 'previous') {
      dispatch({ type: 'selectPage', id: previousPage.id })
      setView({ scale: 1, x: null, y: null })
      return
    }
    if (turn === 'next') {
      dispatch({ type: 'selectPage', id: nextPage.id })
      setView({ scale: 1, x: null, y: null })
      return
    }
    setView({ scale: next.scale, x: next.x, y: next.y })
  }

  const cropTarget = cropId ? page.objects.find((o) => o.id === cropId && o.type === 'photo') : null
  const tapeCrop = tapeCropId ? page.objects.find((o) => o.id === tapeCropId && (o.src || o.mediaFileId) && o.imageWidth) : null
  const selectedObjects = page.objects.filter((o) => state.selectedIds.includes(o.id))
  const selectedText = selectedObjects.length === 1 && ['text','shape'].includes(selectedObjects[0].type) && !selectedObjects[0].locked ? selectedObjects[0] : null
  const currentTextSettings = selectedText?.type === 'shape' ? shapeTextSettings(selectedText) : textSettings(selectedText ?? textDefaults)
  const changeTextSettings = (patch) => {
    if (Object.entries(patch).every(([key, value]) => currentTextSettings[key] === value)) return
    const next = { ...currentTextSettings, ...patch }
    setTextDefaults(next)
    const visualOnly = Object.keys(patch).every((key) => VISUAL_TEXT_KEYS.includes(key))
    if (selectedText) dispatch({ type: 'updateObject', id: selectedText.id, record: true, patch: selectedText.type === 'shape' ? shapeTextFormatPatch(selectedText,patch) : { ...(visualOnly ? patch : textFormatPatch(selectedText, next)), ...('color' in patch && { colorRanges: [] }) } })
  }
  const showMore = moreOpen && selectedObjects.length > 0 && !cropId

  const showToast = useCallback((message, retry) => {
    if (retry) setImportFailure({ message, retry })
    else setToast({ message, key: createId() })
  }, [setToast])

  useEffect(() => {
    const notice = state.collaborationLimitError
    if (!notice) return
    if (textSync.enabled && notice.pageId === page.id) showToast(notice.message)
    dispatch({type:'canvasLimitNoticeShown',id:notice.id})
  }, [textSync.enabled, state.collaborationLimitError, page.id, showToast, dispatch])

  const startExport = (job) => {
    setExportOpen(false)
    if (exportJob) { showToast('이미 내보내고 있어요. 끝난 뒤 다시 시도해 주세요.'); return }
    setExportProgress(0)
    setExportJob(job)
  }
  const startPageExport = (kind, id) => {
    if (state.pagesLoading) { showToast(PAGES_LOADING_MESSAGE); return }
    const index = state.doc.pages.findIndex((p) => p.id === id)
    try {
      const fileName = pngFileName(state.doc.title, index + 1).replace(/.png$/, `.${kind}`)
      // PNG·GIF 도 PDF 처럼 2배로 만든다 (1배는 태블릿 화면에서 흐려 보였다)
      startExport({ kind, snapshot: { ...createExportSnapshot(state.doc.pages[index], { scale: 2 }), fileName } })
    } catch (error) { setExportOpen(false); showToast(error.message) }
  }
  const finishExport = ({ message, error }) => {
    setExportJob(null)
    showToast(error ?? message)
  }

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  // 자르던 사진이 되돌리기 등으로 사라지면 자르기를 끝낸다.
  if (cropId && !cropTarget) setCropId(null)

  const fitToScreen = () => setView({ scale: 1, x: null, y: null })
  // 읽기: 앞장(지금 보이는 캔버스)은 건드리지 않고, 접힘선 너머로 드러나는 새 페이지와 접힌 뒷면만 위에 얹어 움직인다.
  // 다 넘어간 뒤에야 페이지를 바꾼다. (앞장을 다시 그리거나 위치를 잡지 않으므로 떨리지 않는다)
  const flip = useRef(new Animated.Value(0)).current
  const [turn, setTurn] = useState(null) // { page: 드러나는 페이지, from: 넘어가는(보이는) 페이지, dir: 1 다음 · -1 이전, lift }
  const turnRef = useRef(null)
  turnRef.current = turn
  const dragTurn = useRef(null) // 손가락을 따라 넘기는 중 { dir, target, settling }
  // 읽기 모드를 끄거나 화면을 닫으면 진행 중인 넘김을 멈춘다. (멈추면 완료 콜백은 finished=false 로 끝나 페이지를 바꾸지 않는다)
  useEffect(() => { if (!readOnly) { flip.stopAnimation(); setTurn(null); dragTurn.current = null } }, [readOnly, flip])
  useEffect(() => () => flip.stopAnimation(), [flip])
  const nativeDriver = Platform.OS !== 'web'
  const startTurn = (from, target, dir, lift) => {
    flip.stopAnimation()
    flip.setValue(0)
    setTurn({ page: target, from, dir, lift })
  }
  const finishTurn = (target) => { dispatch({ type: 'selectPage', id: target.id }); fitToScreen(); setTurn(null) }
  const selectReadingPage = (index) => {
    if (!loaded || dragTurn.current) return
    const running = turnRef.current
    const base = running ? running.page : page // 넘기는 중이면 그 목적지가 기준
    const baseIndex = state.doc.pages.findIndex((item) => item.id === base.id)
    const target = state.doc.pages[index]
    const edge = readingEdgeMessage(index, state.doc.pages.length)
    if (edge) { showToast(edge); return }
    if (target.id === base.id) return
    if (running) dispatch({ type: 'selectPage', id: base.id }) // 진행 중이던 넘김은 바로 끝낸다 (빠르게 연달아 넘길 때)
    startTurn(base, target, index > baseIndex ? 1 : -1, 0)
    Animated.timing(flip, { toValue: 1, duration: 620, easing: Easing.inOut(Easing.quad), useNativeDriver: nativeDriver }).start(({ finished }) => { if (finished) finishTurn(target) })
  }
  // 손가락 따라 넘기기: 손가락만큼 접고, 놓을 때 넘어간 정도가 충분하면 끝까지 넘기고 아니면 되돌린다.
  const readingDrag = ({ type, dx = 0, duration = 0, y }) => {
    const width = PAGE_WIDTH * zoom
    const drag = dragTurn.current
    if (type === 'start') {
      if (!loaded || turnRef.current || drag) return false
      const dir = dx < 0 ? 1 : -1
      const target = state.doc.pages[pageIndex + dir]
      if (!target) return false
      dragTurn.current = { dir, target }
      startTurn(page, target, dir, turnLift(y))
      return true
    }
    if (!drag || drag.settling) return undefined
    const progress = turnProgress({ dir: drag.dir, dx, width })
    if (type === 'move') { flip.setValue(progress); return undefined }
    const complete = turnShouldComplete({ progress, dir: drag.dir, dx, duration, cancelled: type !== 'end' })
    drag.settling = true
    Animated.timing(flip, { toValue: complete ? 1 : 0, duration: 120 + 380 * (complete ? 1 - progress : progress), easing: Easing.out(Easing.quad), useNativeDriver: nativeDriver }).start(({ finished }) => {
      if (!finished) return
      dragTurn.current = null
      if (complete) finishTurn(drag.target)
      else setTurn(null)
    })
    return undefined
  }
  const readingAction = (action) => {
    if (action === 'menu') { setReaderMenuVisible(visible => !visible); return }
    const base = turnRef.current ? turnRef.current.page : page
    const baseIndex = state.doc.pages.findIndex((item) => item.id === base.id)
    selectReadingPage(baseIndex + (action === 'next' ? 1 : -1))
  }
  const toggleReading = () => {
    if (permissionReadOnly) return
    if (!readingMode && textCommitRef.current?.() === false) return
    Keyboard.dismiss()
    setFocusMode(false)
    setFrameTextEdit(null)
    setReadingMode(!readingMode)
    setReaderMenuVisible(true)
    fitToScreen()
  }
  const measureModeControls = () => modeControlsRef.current?.measureInWindow?.((x, y, width, height) => {
    modeControlsBounds.current = { x, y, width, height }
  })
  useEffect(() => { measureModeControls() }, [stageSize, stageOrigin, readOnly, readerMenuVisible])

  const randomCenter = () => ({
    x: PAGE_WIDTH / 2 + (Math.random() - 0.5) * 160,
    y: PAGE_HEIGHT / 2 + (Math.random() - 0.5) * 120,
  })

  // 스티커·테이프·사진을 넣으면 보관함·옵션 창을 닫는다 (넣은 요소는 선택된 채라 선택 바의 '옵션'으로 바로 열 수 있다)
  // 하단 시트(폰 세로)의 보관함은 닫으면 선택 도구로 돌아간다. 그 밖은 지금처럼 도구를 그대로 둔다
  const closeDrawer = () => {
    setDrawerTab(null)
    if (compact && !landscape) setActiveTool('select')
  }
  const closeAfterInsert = () => {
    setDrawerTab(null)
    setMoreOpen(false)
  }

  const addDecor = (item) => {
    const object = createObjectFromDecor(item, randomCenter())
    dispatch({ type: 'addObjects', objects: [object] })
    closeAfterInsert()
    // 위젯은 붙이자마자 옵션을 열어 기준 날짜부터 정하게 한다
    if (object.widget) setMoreOpen(true)
  }

  const movePage = async (id,toIndex) => {
    try{
      if(textSync.enabled)await textSync.movePage(id,toIndex)
      else dispatch({type:'movePage',id,toIndex})
    }catch(error){showToast(error.message||'페이지 순서를 저장하지 못했어요. 다시 확인해 주세요.')}
  }
  const movePages = async (ids,anchorId,place) => {
    try{
      if(textSync.enabled)await textSync.movePages(ids,anchorId,place)
      else dispatch({type:'movePages',ids,anchorId,place})
    }catch(error){showToast(error.message||'페이지 순서를 저장하지 못했어요. 다시 확인해 주세요.')}
  }
  const resetDiary = () => {
    if(state.pagesLoading){showToast(PAGES_LOADING_MESSAGE);return}
    if(cropId)finishCrop(false)
    dispatch({type:'resetDiary'})
    showToast('다이어리를 초기화했어요. 되돌리기로 복구할 수 있어요.')
  }
  const removePages = async ids => {
    if(state.pagesLoading){showToast(PAGES_LOADING_MESSAGE);return}
    if(cropId)finishCrop(false)
    try{
      if(textSync.enabled){await textSync.removePages(ids);showToast('페이지를 삭제했어요.')}
      else{dispatch({type:'removePages',ids});showToast('페이지를 삭제했어요. 되돌리기로 복구할 수 있어요.')}
    }catch(error){showToast(error.message||'페이지를 삭제하지 못했어요. 다시 확인해 주세요.')}
  }
  const copyPage = async id => {
    if(state.pagesLoading){showToast(PAGES_LOADING_MESSAGE);return}
    try{
      if(textSync.enabled)await textSync.copyPage(id)
      else dispatch({type:'duplicatePage',id})
      showToast('페이지를 복제했어요.')
    }catch(error){showToast(error.message||'페이지 복제 결과를 확인하지 못했어요. 목록을 확인해 주세요.')}
  }

  // 고른 뒤 자르기를 취소했거나 칸이 모자라 넣지 않은 사진: 방금 가져온 새 미디어라 지운다(어디서도 쓰지 않는다)
  const discardUnused = (images, used = []) => {
    discardUnusedPhotoImports(images, used, discardGeneratedMedia).catch(() => {})
  }

  // 사진은 스티커·테이프처럼 틀 없이 바로 붙인다 (자르기는 두 번 누르거나 선택 바에서)
  const pickingPhotos = useRef(false)
  const { visible: photoPanelVisible, toggle: togglePhotoPanel, close: closePhotoPanel } = usePhotoPanel(readOnly)
  // 회원 다이어리의 사진은 서버로 올라간다.
  const photoLimit = textSync.enabled ? { sharedGifMaxBytes: MEDIA_POLICY.sharedGifMaxBytes } : {}
  const addPhotos = async (selectedImages) => {
    // 고르는 창이 떠 있는 동안 다시 누르면 무시한다
    if (pickingPhotos.current) return
    pickingPhotos.current = true
    try {
      setImportFailure(null)
      const images = selectedImages ?? await pickImages(photoLimit)
      if (!images.length) return
      const center = randomCenter()
      const objects = []
      const used = []
      for (const [index, image] of images.entries()) {
        const object = createObjectFromDecor(
          { kind: 'photo', frame: 'none', src: image.src, mediaFileId: image.mediaFileId, poster: image.poster, name: image.name, imageWidth: image.width, imageHeight: image.height },
          { x: center.x + objects.length * 24, y: center.y + objects.length * 24 },
        )
        const patch = await askCrop(object, images.length > 1 ? `사진 자르기 ${index + 1}/${images.length}` : undefined)
        if (patch) { objects.push({ ...object, ...patch }); used.push(image) }
      }
      discardUnused(images, used)
      if (!objects.length) return
      dispatch({ type: 'addObjects', objects })
      closeAfterInsert()
    } catch (error) {
      showToast(mediaFailureMessage(error), () => addPhotos())
    } finally {
      pickingPhotos.current = false
    }
  }

  // 틀·자르기 설정은 두고 사진만 바꾼다.
  const replacePhoto = async (id) => {
    try {
      setImportFailure(null)
      const [image] = await pickImages({ ...photoLimit, multiple: false })
      if (!image) return
      const target = pageNow.current.objects.find((o) => o.id === id)
      if (!target) { discardUnused([image]); return }
      const filling = !hasPhotoMedia(target)
      const media = {
        src: image.src,
        mediaFileId: image.mediaFileId,
        poster: image.poster,
        // 새 사진에 파일 이름이 있을 때만 바꾼다(없으면 '사진 3' · 틀 이름 같은 지금 이름을 둔다)
        ...(image.name ? { name: image.name } : {}),
        imageWidth: image.width,
        imageHeight: image.height,
        crop: { fx: 0.5, fy: 0.5, zoom: 1 },
      }
      const cropped = await askCrop({ ...target, ...media })
      if (!cropped) { discardUnused([image]); return }
      dispatch({ type: 'updateObject', id, record: true, patch: { ...media, ...cropped } })
      showToast(filling ? '사진을 넣었어요.' : '사진을 바꿨어요.')
    } catch (error) {
      showToast(mediaFailureMessage(error), () => replacePhoto(id))
    }
  }

  // 빈 사진 틀 채우기 (선택 바 '사진 채우기' · 빈 자리의 +). 여러 칸 틀은 start 칸부터 빈 칸을 차례로 채운다.
  const fillCells = async (id, start = 0) => {
    const target = page.objects.find((o) => o.id === id)
    if (target && !isStripFrame(target.frame)) { if (!hasPhotoMedia(target)) replacePhoto(id); return }
    try {
      setImportFailure(null)
      const all = emptyPhotoSlots(target)
      const empty = [...all.filter((i) => i >= start), ...all.filter((i) => i < start)]
      if (!empty.length) return
      const images = await pickImages(photoLimit)
      if (!images.length) return
      const latest = pageNow.current.objects.find((o) => o.id === id)
      if (!latest?.cells) { discardUnused(images); return }
      const cells = [...latest.cells]
      const stillEmpty = empty.filter((index) => !cells[index])
      let placed = 0
      const used = []
      for (const [i, index] of stillEmpty.slice(0, images.length).entries()) {
        const cell = photoCell({ ...images[i], imageWidth: images[i].width, imageHeight: images[i].height })
        const cropped = await askCrop(cellCropPhoto({ ...latest, cells: cells.map((c, k) => (k === index ? cell : c)) }, index), `${index + 1}번 칸 자르기`)
        if (!cropped) continue
        cells[index] = { ...cell, crop: cropped.crop }
        used.push(images[i])
        placed += 1
      }
      discardUnused(images, used)
      if (!placed) return
      dispatch({ type: 'updateObject', id, record: true, patch: { cells } })
      showToast(images.length > stillEmpty.length ? `빈 칸 ${placed}개를 채웠어요. 나머지 ${images.length - stillEmpty.length}장은 넣지 않았어요.` : `사진 ${placed}장을 넣었어요.`)
    } catch (error) {
      showToast(mediaFailureMessage(error), () => fillCells(id))
    }
  }

  // 사진·이미지 테이프를 두 번 누르면 자른다. 여러 칸 틀은 누른 칸이 비었으면 사진을 넣고, 찼으면 그 칸을 자른다.
  const editMedia = (object, cell) => {
    if (object.type === 'tape') { setTapeCropId(object.id); return }
    if (!isStripFrame(object.frame)) { if (hasPhotoMedia(object)) startCrop(object.id); else replacePhoto(object.id); return }
    if (cell == null || cell < 0) return
    if (object.cells?.[cell]) startCrop(object.id, cell)
    else fillCells(object.id, cell)
  }

  // 여러 칸 틀의 칸 하나만 바꾼다. 다른 칸·틀 설정은 그대로 둔다.
  const replaceCell = async (id, index) => {
    try {
      setImportFailure(null)
      const [image] = await pickImages({ ...photoLimit, multiple: false })
      if (!image) return
      const target = pageNow.current.objects.find((o) => o.id === id)
      if (!target?.cells) { discardUnused([image]); return }
      const fresh = photoCell({ ...image, imageWidth: image.width, imageHeight: image.height })
      const cropped = await askCrop(cellCropPhoto({ ...target, cells: target.cells.map((c, i) => (i === index ? fresh : c)) }, index), `${index + 1}번 칸 자르기`)
      if (!cropped) { discardUnused([image]); return }
      const cell = { ...fresh, crop: cropped.crop }
      const latest = pageNow.current.objects.find((o) => o.id === id)
      if (!latest?.cells) { discardUnused([image]); return }
      dispatch({ type: 'updateObject', id, record: true, patch: { cells: latest.cells.map((c, i) => (i === index ? cell : c)) } })
      showToast(target.cells[index] ? `${index + 1}번 칸 사진을 바꿨어요.` : `${index + 1}번 칸에 사진을 넣었어요.`)
    } catch (error) {
      showToast(mediaFailureMessage(error), () => replaceCell(id, index))
    }
  }

  // 사진 자르기: 화면 가운데 자르기 창을 연다. '적용'할 때만 사진이 바뀐다.
  // cell: 여러 칸 틀이면 자를 칸 번호
  const startCrop = (id, cell = null) => {
    setDrawerTab(null)
    setMoreOpen(false)
    dispatch({ type: 'select', ids: [id] })
    setPhotoCropCell(cell)
    setPhotoCropId(id)
  }
  const photoCropTarget = photoCropId ? page.objects.find((o) => o.id === photoCropId && o.type === 'photo') : null
  const photoCrop = !photoCropTarget ? null : isStripFrame(photoCropTarget.frame) ? cellCropPhoto(photoCropTarget, photoCropCell) : hasPhotoMedia(photoCropTarget) ? photoCropTarget : null

  const finishCrop = (apply) => {
    if (!apply) dispatch({ type: 'revertToCheckpoint' })
    setCropId(null)
    showToast(apply ? '사진 자르기를 적용했어요.' : '자르기를 취소했어요.')
  }

  const undo = () => {
    if(textSync.enabled&&!localUndo){textSync.undo().then(()=>showToast('내 캔버스 작업을 되돌렸어요.')).catch(error=>showToast(error.message));return}
    if (!state.past.length) return
    if (cropId) setCropId(null)
    qaController?.onHistoryDispatch?.({ phase: 'undo', execution: ++qaHistoryExecutions.current, past: state.past.length, future: state.future.length })
    dispatch({ type: 'undo' })
    showToast('마지막 작업을 되돌렸어요.')
  }

  const redo = () => {
    if(textSync.enabled&&!localRedo){textSync.redo().then(()=>showToast('내 캔버스 작업을 다시 실행했어요.')).catch(error=>showToast(error.message));return}
    if (!state.future.length) return
    qaController?.onHistoryDispatch?.({ phase: 'redo', execution: ++qaHistoryExecutions.current, past: state.past.length, future: state.future.length })
    dispatch({ type: 'redo' })
    showToast('다시 실행했어요.')
  }

  // Optional isolated QA bridge; ordinary editor callers never provide one.
  useLayoutEffect(() => {
    if (!qaController) return
    const value = { undo, redo, pageId: page.id, reading: readOnly, view, doc: state.doc, past: state.past.length, future: state.future.length, loaded, saveStatus }
    qaController.current = value
    qaController.onCommit?.(value)
    return () => { if (qaController.current === value) qaController.current = null }
  }, [qaController, state, cropId, loaded, saveStatus, readOnly, view])

  // 웹(키보드)에서의 단축키
  useEffect(() => {
    if (Platform.OS !== 'web' || readOnly || exportOpen || regionOpen || (activeTool !== 'select' && !(activeTool === 'lasso' && state.selectedIds.length > 0))) return undefined
    const handleKey = (event) => {
      const target = event.target
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target?.tagName)) return
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const selected = page.objects.filter((o) => state.selectedIds.includes(o.id))
      const editable = selected.filter((o) => !o.locked)
      const ids = selected.map((o) => o.id)
      const NUDGE = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }

      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (mod && key === 'y') {
        event.preventDefault()
        redo()
      } else if (key === 'escape') {
        if (cropId) finishCrop(false)
        else dispatch({ type: 'select', ids: [] })
      } else if (cropId) {
        // 자르기 중에는 아래 단축키를 쓰지 않는다.
      } else if (mod && key === 'a') {
        event.preventDefault()
        dispatch({ type: 'selectAll' })
      } else if (mod && (key === 'c' || key === 'x') && selected.length) {
        event.preventDefault()
        objectClipboard.set(selected)
        if (key === 'x') dispatch({ type: 'removeObjects', ids: editable.map((o) => o.id) })
        showToast(key === 'x' ? '잘라 냈어요.' : `${selected.length}개를 복사했어요.`)
      } else if (mod && key === 'v' && objectClipboard.get().length) {
        event.preventDefault()
        paste()
      } else if (mod && key === 'g' && selected.length > 1) {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'ungroup' : 'group', ids })
      } else if (mod && key === 'd' && selected.length) {
        event.preventDefault()
        dispatch({ type: 'duplicateObjects', ids })
      } else if ((key === ']' || key === '[') && selected.length) {
        event.preventDefault()
        dispatch({ type: 'reorder', ids, mode: key === ']' ? (mod ? 'front' : 'forward') : mod ? 'back' : 'backward' })
      } else if (NUDGE[key] && editable.length) {
        // 화살표 1px, Shift 와 함께 10px
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        const [dx, dy] = NUDGE[key]
        dispatch({
          type: 'updateMany',
          record: true,
          patches: Object.fromEntries(editable.map((o) => [o.id, { x: o.x + dx * step, y: o.y + dy * step }])),
        })
      } else if (selected.length && (key === 'delete' || key === 'backspace')) {
        event.preventDefault()
        dispatch({ type: 'removeObjects', ids: editable.map((o) => o.id) })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  // 빈 곳 탭: 선택 해제 + 키보드(이름 입력 등) 내리기. 자르기 중에는 선택을 유지한다.
  const clearSelection = () => {
    Keyboard.dismiss()
    if (!cropId && activeTool !== 'lasso') dispatch({ type: 'select', ids: [] })
  }

  // 툴바에서 연 창(보관함·펜/텍스트/올가미 설정)은 창이나 툴바가 아닌 곳을 누르면 닫는다.
  // 터치를 가로채지 않고(목록 스크롤과 다투지 않게) 누른 위치만 본다:
  // 창·툴바 안의 터치는 그 영역이 먼저 표시하고, 바깥(root)에서는 표시가 없을 때만 닫는다.
  const bubbleOpen = Boolean(photoPanelVisible || drawerTab || showMore || penSettingsOpen || textSettingsOpen || guidesOpen || (activeTool === 'lasso' && lassoSettingsOpen))
  const touchInside = useRef(false)
  const pressEvent = Platform.OS === 'web' ? 'onPointerDown' : 'onTouchStart'
  const markInside = { [pressEvent]: () => (touchInside.current = true) }
  // 폰 세로: 도구 옵션 창은 아래에서 올라오는 하단 시트. 그 밖(태블릿 · 폰 가로)은 기존 떠 있는 창
  const phoneSheet = compact && !landscape
  // 폰 세로의 페이지 목록 · 레이어는 가장자리에서 미끄러져 들어오고 끌어 닫는다. 그 밖은 기존 슬롯
  const renderSlot = ({ side, sideStyle, onWidth, onClose }, children) => phoneSheet
    ? <PhoneSidePanel side={side} top={8} onWidth={onWidth} onClose={onClose}>{children}</PhoneSidePanel>
    : <PhonePanelSlot compact={compact} side={sideStyle} onWidth={onWidth}>{children}</PhonePanelSlot>
  // node: (sheet) => 패널. sheet 는 하단 시트일 때만 { width, dragHandlers }, 아니면 null
  const renderPanel = (node, wrapStyle, { onClose, fixedHeight = false } = {}) => phoneSheet
    ? <PhoneSheet bleed={8} fixedHeight={fixedHeight} insideHandlers={markInside} onHeight={setSheetHeight} onClose={onClose}>{(sheet) => node(sheet)}</PhoneSheet>
    : <View style={wrapStyle} pointerEvents="box-none" {...markInside}>{node(null)}</View>
  const closeBubbles = () => {
    closePhotoPanel()
    setDrawerTab(null)
    setMoreOpen(false)
    setPenSettingsOpen(false)
    setLassoSettingsOpen(false)
    setTextSettingsOpen(false)
    setGuidesOpen(false)
  }
  // 폰: 내보내기 창이 열린 패널 위에 겹치지 않게 패널을 닫는다(좁은 창은 한쪽만)
  useEffect(() => { if (exportOpen && compact) { setLayersOpen(false); setPagesOpen(false) } }, [exportOpen, compact])
  // 폰 회전: 세로 시트와 떠 있는 창은 다른 부품이라 안의 입력이 조용히 사라진다. 창을 닫아 둔다(태블릿 세로 전환과 같은 처리).
  const sheetLayout = useRef(phoneSheet)
  useEffect(() => {
    if (sheetLayout.current === phoneSheet) return
    sheetLayout.current = phoneSheet
    if (!compact) return
    closeBubbles()
    setLayersOpen(false)
    setPagesOpen(false)
  }, [phoneSheet]) // eslint-disable-line react-hooks/exhaustive-deps
  const closeOnOutside = {
    [pressEvent]: () => {
      if (bubbleOpen && !colorPicker && !touchInside.current) closeBubbles()
      touchInside.current = false
    },
  }

  const showPages = !readOnly && pagesOpen && !focusMode
  useLayoutEffect(() => {
    pagePanelMeasurement.current?.emit('editor-layout', { open: showPages, zoom, stageWidth: stageSize?.width ?? null })
  }, [showPages, zoom, stageSize?.width])
  const showLayers = !readOnly && layersOpen && !focusMode
  useEffect(() => {
    if (pageReady || !stageSize || !loaded) return undefined
    const timer = setTimeout(() => setPageReady(true), 120)
    return () => clearTimeout(timer)
  }, [pageReady, stageSize, loaded, layerWidth])
  // 폰: 페이지 목록(가로에서는 레이어도)은 왼쪽, 세로 레이어는 오른쪽에서 열린다.
  // 폰 세로는 페이지 창을 열면 되돌리기 · 저장됨 막대를 오른쪽으로 옮기지 않고 창 뒤로 가린다(사용자 결정 2026-11-03)
  const undoOnRight = compact && ((showPages && landscape) || (landscape && showLayers))
  const hideUndoBar = compact && !landscape && showPages
  // 폰 객체 바의 더보기 메뉴. 페이지 밖까지 터치를 받아야 해서 Canvas 가 아니라 stage 위에 그린다.
  // 다른 요소를 고르거나 페이지·확대·이동이 바뀌면 닫는다 (바 위치가 달라지므로).
  const compactMenuLive = compactMenu && compactMenu.pageId === page.id && compactMenu.key === selectedObjects.map((o) => o.id).join(',')
    && compactMenu.zoom === zoom && compactMenu.ox === offset.x && compactMenu.oy === offset.y
  useEffect(() => { if (compactMenu && !compactMenuLive) setCompactMenu(null) }, [compactMenu, compactMenuLive])
  // 선택 바를 둘 보이는 작업 영역 (작업창 좌표). 폰은 작업창 위에 띄운 페이지 목록·레이어를 뺀 나머지.
  // 태블릿의 페이지 목록·레이어는 작업창 옆에 놓여 작업창이 이미 그만큼 좁다. 패널을 닫으면 영역도 바로 넓어진다.
  const phonePanelLeft = compact && ((showPages && loaded) || (phoneLandscape && showLayers && !readOnly))
  const phonePanelRight = compact && !phoneLandscape && showLayers && !readOnly
  const contextBarFrame = stageSize && {
    x: offset.x,
    y: offset.y,
    area: {
      left: phonePanelLeft ? phonePanelWidths.left : 0,
      top: 0,
      right: stageSize.width - (phonePanelRight ? phonePanelWidths.right : 0),
      bottom: stageSize.height,
    },
  }
  const compactMenuLayout = compactMenuLive && stageSize && placeCompactMenu({
    bar: compactMenu.anchor, // 선택 바가 작업창 좌표로 넘긴다
    floor: stageSize.height - (12 + 44 + 8), ceil: contextBarFrame.area.top + 8, left: contextBarFrame.area.left, right: contextBarFrame.area.right,
  })
  // 레이어 패널을 열고 닫을 때도 페이지 목록처럼 새 작업창 크기를 바로 써서 툴바와 페이지가 한 번에 같이 움직이게 한다.
  // 패널은 오른쪽 바깥 여백(16)을 덮으므로 작업창 폭은 패널 폭 + 간격 - 16 만큼 바뀐다.
  const toggleLayers = (open) => {
    if (open === showLayers) return
    // 좁은 창에서는 한쪽을 열면 다른 쪽을 닫아 작업 공간을 확보한다.
    const closePages = panelLayout.singlePanel && open && showPages
    if (closePages) setPagesOpen(false)
    setLayersOpen(open)
    // 폰은 레이어를 작업창 위에 띄우므로 작업창 크기가 그대로다.
    if (compact) return
    const delta = layerWidth + BODY_GAP - BODY_PADDING
    setStageSize((prev) => prev && { ...prev, width: prev.width + (open ? -delta : delta) + (closePages ? PAGE_LIST_WIDTH + BODY_GAP : 0) })
  }

  // 리본(태블릿)과 폰 도구 막대가 함께 쓰는 도구·보관함·내보내기 동작
  const openDrawer = (tab) => {
    // 사진도 다른 보관함처럼 툴바 아래에서 선택한다 (빈 사진 틀은 위젯 칸에 있다)
    if (tab === 'photo') {
      if (readOnly) return
      closeBubbles()
      if (cropId) finishCrop(false)
      setActiveTool('select')
      togglePhotoPanel()
      return
    }
    closePhotoPanel()
    setLassoSettingsOpen(false)
    setGuidesOpen(false)
    setTextSettingsOpen(false)
    setPenSettingsOpen(false)
    if (cropId) finishCrop(false)
    setMoreOpen(false)
    setActiveTool('select')
    setDrawerTab(drawerTab === tab ? null : tab)
  }
  const selectTool = (tool) => {
    closePhotoPanel()
    if (tool !== activeTool && tool !== 'shape') {
      toolChangeMeasurement.current?.dispose()
      toolChangeMeasurement.current = startPagePanelMeasurement({ kind: 'tool-change', from: activeTool, to: tool, objects: page.objects.length, pages: state.doc.pages.length })
    }
    setGuidesOpen(false)
    setLassoSettingsOpen(tool === 'lasso' ? tool !== activeTool || !lassoSettingsOpen : false)
    setTextSettingsOpen(tool === 'text' ? !textSettingsOpen : false)
    setPenSettingsOpen(['pen', 'highlighter', 'eraser'].includes(tool) && tool === activeTool && !penSettingsOpen)
    if (cropId) finishCrop(false)
    setTapeCropId(null)
    setDrawerTab(null)
    setMoreOpen(false)
    const keepSelection = (tool === 'text' && activeTool !== 'lasso') || tool === 'lasso' || (activeTool === 'lasso' && tool === 'select')
    if (!keepSelection) dispatch({ type: 'select', ids: [] })
    if (tool === 'lasso' || (activeTool === 'lasso' && tool === 'select')) {
      setTextEditing(null)
      if (activeTool !== 'lasso') setLasso(current => ({ ...current, mode: 'replace' }))
    }
    setActiveTool(tool)
  }
  const openExport = () => {
    if (!exportEnabled) return
    if (state.pagesLoading) { showToast(PAGES_LOADING_MESSAGE); return }
    if (textEditing) { showToast('텍스트 편집을 완료한 뒤 내보내 주세요.'); return }
    if (cropId || tapeCropId) { showToast('자르기를 마친 뒤 내보내 주세요.'); return }
    Keyboard.dismiss()
    setExportOpen(true)
  }

  const openDiarySharing = () => {
    if (textEditing || cropId || tapeCropId || photoCropId) { showToast('입력이나 자르기를 마친 뒤 공유해 주세요.'); return }
    Keyboard.dismiss()
    onOpenSharing?.()
  }
  const goHome = () => {
    if (onHome) onHome()
    else showToast('다이어리 홈은 다른 화면에서 연결될 예정이에요.')
  }
  const togglePages = () => {
    setFocusMode(false)
    const open = pagesClosing || !showPages
    if (open) thumbnailWork.current = createThumbnailWorkQueue()
    else thumbnailWork.current?.stop()
    pagePanelMeasurement.current?.dispose()
    pagePanelMeasurement.current = startPagePanelMeasurement({ open, tool: activeTool, objects: page.objects.length, pages: state.doc.pages.length })
    if (pagesClosing) { cancelPageClose(); setPagesClosing(false); return }
    if (Platform.OS === 'ios' && !compact && !open) {
      setPagesClosing(true)
      pageCloseScheduler.current.start(() => {
        setPagesOpen(false)
        setPagesClosing(false)
      })
      return
    }
    // 좁은 창에서는 한쪽을 열면 다른 쪽을 닫는다.
    const closeLayers = panelLayout.singlePanel && open && showLayers
    if (closeLayers) setLayersOpen(false)
    setPagesOpen(open)
    // 작업창 왼쪽 끝이 움직이므로 새 크기를 같은 화면에서 바로 써서 한 번에 맞춘다.
    // (측정값을 기다리면 페이지가 왼쪽 끝을 따라 한 번 밀렸다가 다시 가운데로 와서 두 번 움직였다)
    // 폰은 페이지 목록을 작업창 위에 띄우므로 작업창 크기가 그대로다.
    const delta = compact ? 0 : PAGE_LIST_WIDTH + BODY_GAP
    if (delta) setStageSize((prev) => prev && { ...prev, width: prev.width + (showPages ? delta : -delta) + (closeLayers ? layerWidth + BODY_GAP - BODY_PADDING : 0) })
  }
  const switchLayers = () => {
    setFocusMode(false)
    toggleLayers(!showLayers)
  }
  const toggleOrientation = onToggleOrientation && (() => {
    onToggleOrientation()
  })
  // 폰 집중 편집은 가로 화면에서 한다.
  const startPhoneFocus = () => {
    closeBubbles()
    setFocusMode(true)
    if (!landscape) onToggleOrientation?.()
    showToast('집중 편집 · 두 손가락으로 이동하고 확대하세요.')
  }
  const toggleGuides = () => {
    const next = !guidesOpen
    closeBubbles()
    setGuidesOpen(next)
  }

  // 모든 화면 규격의 Android 뒤로가기는 현재 편집 상태를 한 단계씩 닫는다.
  // 모달·도구·선택·보조 패널이 모두 닫혀 있을 때만 보관함으로 이동한다.
  useEffect(() => {
    if (Platform.OS !== 'android' || backDisabled) return undefined
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (colorPicker) return false // The topmost inline picker handles back first.
      if (readOnly || saveStatus === 'load-error') { goHome(); return true }
      if (photoCropId) { setPhotoCropId(null); return true }
      if (tapeCropId) { setTapeCropId(null); return true }
      if (exportSnapshot) { setExportSnapshot(null); setRegionOpen(false); return true }
      if (regionOpen) { setRegionOpen(false); return true }
      if (exportOpen) { setExportOpen(false); return true }
      if (overviewFilter) { setOverviewFilter(null); return true }
      if (templatePickerOpen) { setTemplatePickerOpen(false); return true }
      if (textLinkTarget) { setTextLinkTarget(null); return true }
      if (objectLinkTarget) { setObjectLinkTarget(null); return true }
      if (textEditing) { Keyboard.dismiss(); setTextEditing(null); return true }
      if (frameTextEdit) { Keyboard.dismiss(); setFrameTextEdit(null); return true }
      if (cropId) { finishCrop(false); return true }
      if (importFailure) { setImportFailure(null); return true }
      if (bubbleOpen) { closeBubbles(); return true }
      if (focusMode) { setFocusMode(false); return true }
      if (state.selectedIds.length) { dispatch({ type: 'select', ids: [] }); return true }
      // 태블릿 가로에서 페이지 목록 · 레이어가 함께 열려 있으면 한 번에 닫는다(한 번씩 세 번 누르던 것)
      if (pagesOpen || layersOpen) { if (pagesOpen) togglePages(); if (layersOpen) toggleLayers(false); return true }
      goHome()
      return true
    })
    return () => subscription.remove()
  }, [readOnly, saveStatus, bubbleOpen, cropId, exportOpen, exportSnapshot, focusMode, frameTextEdit, importFailure, layersOpen, objectLinkTarget, overviewFilter, pagesOpen, photoCropId, regionOpen, state.selectedIds.length, tapeCropId, templatePickerOpen, textEditing, textLinkTarget, colorPicker, backDisabled])

  useEffect(() => {
    if (colorPicker && (readOnly || page.id !== colorPicker.pageId || activeTool !== colorPicker.tool || colorScreen.width !== colorPicker.screen.width)) setColorPicker(null)
  }, [colorPicker, readOnly, page.id, activeTool, colorScreen.width, colorScreen.height])


  const previewScreen = useWindowDimensions()
  const readingPreviews = useReadingPreviews({ enabled: readOnly && loaded, page, previous: previousPage, next: nextPage, target: turn?.page, zoom, moving: viewMoving || Boolean(turn) })

  const phoneToolbar = !readOnly && compact ? (
    <PhoneToolbar
      onOpenSharing={!phoneLandscape && onOpenSharing ? openDiarySharing : undefined}
      invitationCount={invitationCount}
      sharingMembers={sharingMembers}
      {...markInside}
      vertical={landscape}
      bottomInset={landscape ? Math.max(bottomInset, 76) : 0}
      activeTool={activeTool}
      drawerTab={photoPanelVisible ? 'photo' : drawerTab}
      guidesActive={guidesOpen || hasGuides(guides)}
      penColor={penSettings.color}
      highlighterColor={highlighterSettings.color}
      onSelectTool={selectTool}
      onOpenDrawer={openDrawer}
      onOpenGuides={toggleGuides}
    />
  ) : null

  if (saveStatus === 'load-error') return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.surfaceSoft }}>
      <Text accessibilityRole="alert" style={{ color: colors.text, fontSize: 16, textAlign: 'center', marginBottom: 16 }}>저장된 기록을 불러오지 못했어요. 기존 기록을 지키기 위해 편집과 저장을 멈췄어요. 홈으로 돌아간 뒤 다시 열어 주세요.</Text>
      <DioButton variant="tonal" label="홈으로 돌아가기" onPress={goHome} />
    </View>
  )
  return (
    <View
      style={[
        styles.root,
        !compact && bottomInset > 0 && { paddingBottom: bottomInset },
        !readOnly && phoneLandscape && !phoneFocus && styles.rootBetweenRails,
      ]}
      {...closeOnOutside}
      onStartShouldSetResponderCapture={(event) => {
        const b = modeControlsBounds.current
        const { pageX: x, pageY: y } = event.nativeEvent
        if (b && x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return false
        return Boolean(textEditing && textBoundary.current?.(event))
      }}
      onResponderTerminationRequest={() => false}
    >
      {readingPreviews.surface && <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: Math.max(PAGE_WIDTH, previewScreen.width), height: Math.max(PAGE_HEIGHT, previewScreen.height) }}>
        {readingPreviews.surface}<View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSoft }]} />
      </View>}

      {/* 내보낼 페이지는 편집 화면 맨 아래(가려진 곳)에 그려 찍는다 */}
      <ExportRunner job={exportJob} onProgress={setExportProgress} onFinish={finishExport} />
      {!readOnly && phoneLandscape && !phoneFocus && (
        <PhoneEditorRail
          {...markInside}
          pagesOpen={showPages}
          layersOpen={showLayers}
          readOnly={readOnly}
          onHome={goHome}
          onTogglePages={togglePages}
          onToggleLayers={switchLayers}
          onExport={openExport}
          exportEnabled={exportEnabled}
          onOpenSharing={onOpenSharing ? openDiarySharing : undefined}
          invitationCount={invitationCount}
          sharingMembers={sharingMembers}
          onFocus={startPhoneFocus}
        />
      )}
      {!readOnly && !phoneLandscape && !phoneFocus && <TopBar
        compact={compact}
        doc={state.doc}
        onRename={diary?.canManage === false ? undefined : async (title) => {
          const accepted = await onRenameDiary?.(title)
          if (accepted !== false) dispatch({ type: 'renameDoc', title })
        }}
        layersOpen={showLayers}
        pagesOpen={showPages}
        pagesWidth={PAGE_LIST_WIDTH}
        onRightWidth={(width) => { if (Math.abs(width - layerWidth) >= 0.5) setLayerWidth(width) }}
        focusMode={focusMode}
        onHome={goHome}
        onOpenSharing={onOpenSharing ? openDiarySharing : undefined}
        invitationCount={invitationCount}
        sharingMembers={sharingMembers}
        onCloseTab={onCloseTab ?? goHome}
        tabs={tabs}
        activeTabId={diary?.id}
        onSelectTab={onSelectTab}
        readOnly={readOnly}
        onTogglePages={togglePages}
        onToggleLayers={switchLayers}
        onToggleFocus={() => {
          setFocusMode(!focusMode)
          if (!focusMode) showToast('집중 편집 · 양옆 패널을 닫았어요.')
        }}
        exportEnabled={exportEnabled}
        shareLabel="공유 및 내보내기"
        shareIcon="share"
        onShareAnchor={setExportAnchor}
        onShare={openExport}
      />}
      {!landscape && phoneToolbar}
      {!readOnly && !compact && (
        <Ribbon
          {...markInside}
          onAnchor={setToolAnchor}
          penColor={penSettings.color}
          highlighterColor={highlighterSettings.color}
          onPresetColor={(tool, color) => (tool === 'highlighter' ? setHighlighterSettings({ ...highlighterSettings, color }) : setPenSettings({ ...penSettings, color }))}
          activeTool={activeTool}
          drawerTab={photoPanelVisible ? 'photo' : drawerTab}
          onOpenDrawer={openDrawer}
          onSelectTool={selectTool}
          onPlaceholder={(label) => showToast(`${label}은(는) 다른 담당 기능이라 아직 연결하지 않았어요.`)}
          guidesActive={guidesOpen || hasGuides(guides)}
          onOpenGuides={toggleGuides}
        />
      )}

      {/* 폰은 내보내기 버튼 위치(세로 상단 바·가로 왼쪽 막대)와 상관없이 화면 가운데에 띄운다 */}
      {exportOpen && <ExportMenu mobilePortrait={compact && !landscape} anchor={compact ? null : exportAnchor} doc={state.doc} currentId={page.id} onClose={() => setExportOpen(false)} onRegion={onRegionExport ?? (() => { setExportOpen(false); setRegionOpen(true) })} onPng={(id) => startPageExport('png', id)} onGif={(id) => startPageExport('gif', id)} onPdf={(snapshots) => startExport({ kind: 'pdf', snapshots })} />}
      {regionOpen && <RegionExportSelector page={page} visible={!exportSnapshot} onConfirm={(selection) => {
        setExportSnapshot(createRegionExportSnapshot(page, { ...selection, pageWidth: PAGE_WIDTH, pageHeight: PAGE_HEIGHT, title: state.doc.title, pageNumber: state.doc.pages.findIndex((p) => p.id === page.id) + 1 }))
      }} onCancel={() => { setRegionOpen(false); setExportOpen(true) }} />}
      {exportSnapshot && <PageExportPreview snapshot={exportSnapshot} onReselect={exportSnapshot.region ? () => setExportSnapshot(null) : undefined} onClose={() => { setExportSnapshot(null); setRegionOpen(false) }} />}
      {overviewFilter && (
        <PageOverview
          canUndoDelete={!textSync.enabled}
          pages={state.doc.pages}
          currentId={page.id}
          initialFilter={overviewFilter}
          onSelect={(id) => { if (cropId) finishCrop(false); dispatch({ type: 'selectPage', id }) }}
          onToggleIndex={readOnly ? null : (id) => dispatch({ type: 'togglePageIndex', id })}
          onReset={readOnly || textSync.enabled ? null : resetDiary}
          onDelete={readOnly ? null : removePages}
          onClose={() => setOverviewFilter(null)}
        />
      )}
      {templatePickerOpen && !readOnly && <PageAddPicker compact={compact} orientation={templateOrientation} currentAssetId={page.backgroundAssetId} appearance={state.doc.paperAppearance} anchor={{ left: 16 + PAGE_LIST_WIDTH + 12, bottom: 16 + bottomInset }}
        myPapers={myLibrary.papers}
        onSelectMine={async (item, chosen) => {
          try{
            const pages=chosen.map(paper=>pdfDocPage(paper,state.doc.orientation??templateOrientation,state.doc.paperAppearance))
            if(textSync.enabled)await textSync.addPdfPages(pages)
            else dispatch({type:'addPage',pages})
            setTemplatePickerOpen(false);fitToScreen()
          }catch(error){showToast(error.message||'페이지를 생성하지 못했어요. 다시 확인해 주세요.')}
        }}
        onClose={() => setTemplatePickerOpen(false)} onSelect={async backgroundAssetId => {
          try{
            if(textSync.enabled)await textSync.addPage(backgroundAssetId)
            else dispatch({type:'addPage',backgroundAssetId,paperAppearance:newPageAppearance(state.doc.paperAppearance,await loadDefaultPaperStyle())})
            setTemplatePickerOpen(false);fitToScreen()
          }catch(error){showToast(error.message||'페이지를 생성하지 못했어요. 다시 확인해 주세요.')}
        }} />}
      <MediaNotice references={state.doc} importFailure={importFailure} onDismissImport={() => setImportFailure(null)} />
      {settingsPageId && !readOnly && textSync.enabled && <PageSettingsDialog key={settingsPageId} pageId={settingsPageId}
        onLoad={textSync.loadPageSettings} onSave={async (id, body) => { await textSync.updatePage(id, body); fitToScreen() }} onClose={() => setSettingsPageId(null)} />}
      <View style={[styles.body, compact && styles.bodyCompact, readOnly && styles.readingBody]}>
        {/* 패널 사이 틈을 누르면 선택 해제. 패널·목록을 감싸지 않고 뒤에 깔아 둔다. (감싸면 Android 목록 스크롤이 잘 안 먹음) */}
        <TapCatcher onTap={clearSelection} style={StyleSheet.absoluteFill} />
        {/* 목록이 불러온 뒤에 나타나면 작업창 폭이 그때 바뀌어 페이지를 또 그린다 → 자리를 먼저 잡아 첫 측정이 최종 크기가 되게 한다 */}
        {showPages && !loaded && !compact && <View style={pageListFrame(true)} />}
        {showPages && loaded && (
          renderSlot({ side: 'left', sideStyle: styles.phonePanelLeft, onWidth: (left) => setPhonePanelWidths((prev) => ({ ...prev, left })), onClose: togglePages },
          <PagePanelVisibility enabled={Platform.OS === 'ios' && !compact} hidden={pagesClosing}>
          <PageList
            phone={phoneSheet}
            fillHeight={Platform.OS === 'ios' && !compact}
            canUndoDelete={!textSync.enabled}
            qaMeasurement={pagePanelMeasurement.current}
            thumbnailWork={Platform.OS === 'web' ? null : thumbnailWork.current}
            readOnly={readOnly}
            edge={(!compact || phoneSheet) && !readOnly} // 읽기 화면은 바깥 여백이 없다(readingBody). 폰 세로도 레이어처럼 화면 끝에 붙인다
            pages={deferredPages}
            currentId={page.id}
            cropId={cropTarget?.id ?? null}
            onMove={movePage}
            onMovePages={movePages}
            onEmptyTap={clearSelection}
            onSelect={(id) => {
              if (cropId) finishCrop(false)
              if (id !== page.id) {
                pageSelectMeasurement.current?.dispose()
                const target = state.doc.pages.find(item => item.id === id)
                pageSelectMeasurement.current = startPagePanelMeasurement({ kind: 'page-select', objects: target?.objects.length ?? 0, pages: state.doc.pages.length })
              }
              dispatch({ type: 'selectPage', id })
            }}
            onAdd={() => { if (cropId) finishCrop(false); setTemplatePickerOpen(true) }}
            onDuplicate={copyPage}
            onSettings={textSync.enabled && !readOnly ? setSettingsPageId : undefined}
            onToggleIndex={(id) => dispatch({ type: 'togglePageIndex', id })}
            onReset={readOnly || textSync.enabled ? null : resetDiary}
            onRemovePages={removePages}
            onRemove={id=>removePages([id])}
          />
          </PagePanelVisibility>)
        )}

        <View ref={stageRef} collapsable={false}
          onTouchStart={() => setInputActive(true)}
          onTouchEnd={(event) => { if (!event.nativeEvent.touches?.length) setInputActive(false) }}
          onTouchCancel={() => setInputActive(false)}
          style={[styles.stage, !compact && !readOnly && styles.stageEdge, phoneSheet && sheetHeight > 0 && { overflow: 'visible' }]}
          onLayout={() => stageRef.current?.measureInWindow((x, y) => setStageOrigin({ x, y }))}>
          {/* 선택 바는 페이지 밖(보이는 작업 영역 안)까지 나가므로 페이지가 아니라 작업창 위 층에 그린다. 확대·이동하는 동안은 숨긴다. */}
          <StageOverlayHost hidden={viewMoving}>
          <Viewport
            fingerPan={drawingInput === 'pen' && !readOnly && ['pen', 'highlighter', 'eraser'].includes(activeTool)}
            reading={readOnly}
            readingLinkRef={readingLinkRef}
            onReadingAction={readingAction}
            onReadingDrag={readingDrag}
            zoom={zoom}
            scale={viewportLocked ? 1 : view.scale}
            interactionLocked={viewportLocked}
            offset={offset}
            resolveZoom={resolveZoom}
            resolvePan={resolvePan}
            onView={commitView}
            onMovingChange={setViewMoving}
            onTapEmpty={() => { clearSelection(); setPageMenuRequest(null) }}
            onLongPress={activeTool === 'hand' && !readOnly ? (point) => setPageMenuRequest({ ...point, key: Date.now() }) : null}
            dragToPan={!viewportLocked && (readOnly ? view.scale > 1 : activeTool === 'hand')}
            onLayout={(event) => { setStageSize(event.nativeEvent.layout); stageRef.current?.measureInWindow((x, y) => setStageOrigin({ x, y })) }}
          >
            {/* 확대·이동 중이거나 화면 밖에 있는 GIF 는 첫 장면으로 멈춘다 (StaticPage) */}
            <ViewportMotion.Provider value={viewportMotion}>
              <View style={{ width: PAGE_WIDTH * zoom, height: PAGE_HEIGHT * zoom }}>
              {/* 아직 내용을 읽지 못한 페이지: 읽을 때까지 입력을 막는다 */}
              {page.unloaded && (
                <Pressable style={styles.pageLoading} accessibilityLabel="페이지 불러오는 중">
                  <Text style={styles.pageLoadingText}>페이지 불러오는 중…</Text>
                </Pressable>
              )}
              {/* 크기가 정해진 뒤 한 번에 그린다(임시 배율 .6 → 측정 크기 → 상단바 · 패널 폭 반영 순서로 세 번 그렸다) */}
              {pageReady && <Canvas
                onStrokeCommitted={recordPenColorUse}
                readingImage={readingPreviews.current}
                qaPageMeasurement={pageSelectMeasurement.current}
                showBackground={loaded}
                compact={compact}
                compactMenu={compactMenu}
                onCompactMenu={(spec) => setCompactMenu(spec && { ...spec, pageId: page.id, zoom, ox: offset.x, oy: offset.y })}
                activeTool={activeTool}
                // 창이 열린 채 펜·형광펜·지우개로 캔버스를 누르면 그 터치로 그리지 않고 창만 닫는다
                inputBlocker={bubbleOpen ? { ...markInside, onResponderRelease: closeBubbles } : null}
                lassoShape={lasso.shape}
                lassoMode={lasso.mode}
                onLassoCommit={(ids) => {
                  dispatch({ type: 'selectExact', ids })
                  setLasso(current => ({ ...current, mode: 'replace' }))
                }}
                onLassoModeChange={(mode) => setLasso(current => ({ ...current, mode: current.mode === mode ? 'replace' : mode }))}
                penSettings={penSettings}
                highlighterSettings={highlighterSettings}
                straightAssist={straightAssist}
                eraserSize={eraserSize}
                eraserMode={eraserMode}
                eraserTarget={eraserTarget}
                textBoundary={textBoundary}
                onRevealText={(dy) => commitView(resolvePan({ scale: view.scale, zoom, x: offset.x, y: offset.y }, 0, -dy))}
                textEditingTop={stageOrigin.y + 8}
                onTextPaletteChange={setTextPalette}
                textPaletteBounds={textPaletteBounds}
                textCommitRef={textCommitRef}
                onReadingLinkStart={() => { readingLinkRef.current = true }}
                textEditing={textEditing?.pageId === page.id ? textEditing : null}
                onEditText={(object) => { setTextSettingsOpen(false); textReturnTool.current = returnableTool(activeTool); setTextEditing({ ...object, pageId: page.id, existing: true }) }}
                onTextSettings={() => { setTextSettingsOpen(current => !current); setMoreOpen(false) }}
                onCopy={(objects) => { objectClipboard.set(objects); showToast(`${objects.length}개를 복사했어요.`) }}
                onPaste={paste}
                canPaste={copiedObjects.length > 0}
                paperAppearance={normalizePaperAppearance(page.paperAppearance)}
                menuRequest={pageMenuRequest}
                onPaperAppearance={(appearance, all) => dispatch({ type: 'setPaperAppearance', appearance, all })}
                onCut={(objects) => { objectClipboard.set(objects); dispatch({ type: 'removeObjects', ids: objects.filter(o => !o.locked).map(o => o.id) }); showToast('잘라 냈어요.') }}
                onTextLink={setTextLinkTarget}
                onObjectLink={setObjectLinkTarget}
                onCopyLink={(href) => copyText(href).then(() => showToast('링크를 복사했어요.')).catch(() => showToast('링크를 복사하지 못했어요.'))}
                gridGuides={guides}
                linkBadges={linkBadges}
                textSettingsOpen={textSettingsOpen}
                onCancelText={() => setTextEditing(null)}
                onSaveText={(text, colorRanges = [], styleRanges = [], measuredHeight = null, measuredWidth = null) => {
        if (textEditing?.type === 'shape') {
          if (textEditing.pageId === page.id && (text !== (textEditing.text ?? '') || JSON.stringify(colorRanges)!==JSON.stringify(textEditing.colorRanges??[]) || JSON.stringify(styleRanges)!==JSON.stringify(textEditing.styleRanges??[]))) dispatch({type:'updateObject',id:textEditing.id,record:true,patch:{text,colorRanges,styleRanges}})
          setTextEditing(null)
          return
        }
        // 상자 높이는 실제로 그려진 글자 높이에 맞춘다 (위아래 여백 없이). 글자만큼 넓어지는 상자는 폭도 맞춘다.
        const fitted = {
          ...(Number.isFinite(measuredHeight) && measuredHeight > 0 && { h: measuredHeight }),
          ...(Number.isFinite(measuredWidth) && measuredWidth > 0 && { w: measuredWidth, baseWidth: measuredWidth }),
        }
        if (textEditing.pageId === page.id) {
          if (textEditing.existing) {
            if (text !== textEditing.text || JSON.stringify(colorRanges) !== JSON.stringify(textEditing.colorRanges ?? []) || JSON.stringify(styleRanges) !== JSON.stringify(textEditing.styleRanges ?? []) || (fitted.h && Math.abs(fitted.h - textEditing.h) > 0.5) || (fitted.w && Math.abs(fitted.w - textEditing.w) > 0.5)) {
              if (!text.trim()) dispatch({ type: 'removeObjects', ids: [textEditing.id] })
              else dispatch({ type: 'updateObject', id: textEditing.id, record: true, patch: { ...textFormatPatch({ ...textEditing, ...fitted, text, styleRanges }, textSettings(textEditing)), colorRanges, styleRanges, ...fitted } })
            }
          } else if (text.trim()) dispatch({ type: 'addObjects', objects: [{ ...createText({ ...textEditing, ...(fitted.w && { width: fitted.w }), text, colorRanges, styleRanges }), ...fitted }] })
        }
        setTextEditing(null)
        setActiveTool(textReturnTool.current ?? 'select')
      }}
                onCreateText={(box) => { setTextSettingsOpen(false); textReturnTool.current = returnableTool(activeTool); setTextEditing({ ...textDefaults, ...box, id: createId(), pageId: page.id, text: '' }) }}
                readOnly={readOnly}
                page={page}
                zoom={zoom}
                selectedIds={state.selectedIds}
                cropId={cropTarget?.id ?? null}
                dispatch={dispatch}
                moreOpen={showMore}
                onToggleMore={() => {
                  setDrawerTab(null)
                  setMoreOpen(!showMore)
                }}
                onCrop={(id) => (page.objects.find((o) => o.id === id)?.type === 'tape' ? setTapeCropId(id) : startCrop(id))}
                onEditMedia={editMedia}
                frameTextEdit={frameTextEdit?.pageId === page.id ? frameTextEdit : null}
                onEditFrameText={(object, line) => setFrameTextEdit(object ? { pageId: page.id, id: object.id, line } : null)}
                onFillCells={fillCells}
                onFillSlot={(object, slot) => fillCells(object.id, slot ?? 0)}
                onToast={showToast}
                contextBarInside={markInside}
                contextBarFrame={contextBarFrame}
              />}
              {readOnly && turn && <ReadingPageTurn image={readingPreviews.target} page={turn.page} from={turn.from} zoom={zoom} width={PAGE_WIDTH} height={PAGE_HEIGHT} dir={turn.dir} lift={turn.lift ?? 0} progress={flip} />}
              </View>
            </ViewportMotion.Provider>
          </Viewport>
          </StageOverlayHost>

          {!readOnly && activeTool === 'lasso' && lassoSettingsOpen && !drawerTab && (
            renderPanel((sheet) => <LassoSettings shape={lasso.shape} onClose={() => setLassoSettingsOpen(false)}
              onShapeChange={(shape) => setLasso(current => ({ ...current, shape }))} sheet={Boolean(sheet)} dragHandlers={sheet?.dragHandlers} />, [styles.penSettingsWrap, toolPopoverStyle()], { onClose: () => setLassoSettingsOpen(false) })
          )}
          {/* 앱: 고른 글자의 '선택한 글자' 도구줄을 키보드 바로 위(작업 영역 아래 끝)에 둔다. 고른 글자 곁에는 시스템 글자 메뉴가 뜬다 */}
          {!readOnly && textEditing && textPalette?.placement === 'panel' && (
            <View style={[styles.textRangeWrap, keyboardTop != null && stageSize && { bottom: keyboardPanelBottom({ stageTop: stageOrigin.y, stageHeight: stageSize.height, keyboardTop }) }]} pointerEvents="box-none" {...markInside}>
              {textPalette.content}
            </View>
          )}
          {/* 웹 말풍선: 고른 줄 위에(위쪽 막대에 닿으면 아래에) 붙인다 */}
          {!readOnly && textEditing && textPalette && textPalette.placement !== 'panel' && (() => {
            const lineTop = (textPalette.anchor?.y ?? stageOrigin.y) - stageOrigin.y
            const lineBottom = lineTop + (textPalette.anchor?.height ?? 0)
            const paletteTop = compact ? 84 : 8
            const above = lineTop - TEXT_ACTION_BAR_HEIGHT - 6 >= paletteTop
            return <View style={[styles.textPaletteWrap, {
              left: Math.max(8, Math.min((textPalette.anchor?.x ?? stageOrigin.x) - stageOrigin.x, (stageSize?.width ?? 600) - TEXT_ACTION_BAR_WIDTH - 8)),
              ...(above ? { bottom: (stageSize?.height ?? 500) - lineTop + 6 } : { top: Math.max(paletteTop, Math.min(lineBottom + 6, (stageSize?.height ?? 500) - 164)) }),
            }]} {...markInside}>
              {textPalette.content}
            </View>
          })()}
          {!readOnly && textLinkTarget && <TextLinkDialog initialValue={textLinkTarget.styleRanges?.find(r => r.href)?.href ?? ''} onCancel={() => setTextLinkTarget(null)} onSave={(href) => {
            dispatch({ type: 'updateObject', id: textLinkTarget.id, record: true, patch: { styleRanges: formatTextRange(textLinkTarget.text, textLinkTarget.styleRanges, { start: 0, end: textLinkTarget.text.length }, { href: href || null }) } })
            setTextLinkTarget(null)
          }} />}
          {!readOnly && objectLinkTarget && <TextLinkDialog badge={{ value: linkBadges, onChange: setLinkBadges }} initialValue={objectLinkTarget.href ?? ''} onCancel={() => setObjectLinkTarget(null)} onSave={(href) => {
            dispatch({ type: 'updateObject', id: objectLinkTarget.id, record: true, patch: { href: href || null } })
            setObjectLinkTarget(null)
            showToast(href ? '링크를 걸었어요. 읽기 모드에서 누르면 열려요.' : '링크를 지웠어요.')
          }} />}
          {!readOnly && guidesOpen && !drawerTab && (
            renderPanel((sheet) => <GuideSettings guides={guides} onChange={setGuides} onClose={() => setGuidesOpen(false)} sheet={Boolean(sheet)} dragHandlers={sheet?.dragHandlers} />, [styles.penSettingsWrap, toolPopoverStyle()], { onClose: () => setGuidesOpen(false) })
          )}
          {/* 텍스트 서식: 고른 텍스트를 고칠 때는 다른 옵션 창처럼 요소 옆에, 텍스트 도구의 기본값을 정할 때는 툴바 아래에 */}
          {!readOnly && textSettingsOpen && !textEditing && !drawerTab && (
            // 폰 세로는 고른 글자가 있어도 하단 시트(다른 도구 옵션과 같은 자리 · 열고 닫는 손짓이 같다)
            (selectedText && !phoneSheet
              ? <View style={[styles.optionsWrap, optionsPlacement(selectedObjects, zoom, offset, stageSize, compact ? OPTIONS_TOP_PHONE : OPTIONS_TOP)]} pointerEvents="box-none" {...markInside}>
                  <TextSettings verticalAlignment={selectedText?.type === 'shape'} settings={currentTextSettings} onChange={changeTextSettings} onClose={() => setTextSettingsOpen(false)} />
                </View>
              : renderPanel((sheet) => <TextSettings verticalAlignment={selectedText?.type === 'shape'} settings={currentTextSettings} onChange={changeTextSettings} onClose={() => setTextSettingsOpen(false)} sheet={Boolean(sheet)} dragHandlers={sheet?.dragHandlers} />, [styles.penSettingsWrap, toolPopoverStyle()], { onClose: () => setTextSettingsOpen(false) }))
          )}
          {!readOnly && ['pen', 'highlighter'].includes(activeTool) && penSettingsOpen && !drawerTab && (
            renderPanel((sheet) => <PenSettings onOpenColorPicker={request => setColorPicker({ ...request, tool: activeTool, pageId: page.id, screen: { width: colorScreen.width, height: colorScreen.height } })} key={activeTool} settings={activeTool === 'highlighter' ? highlighterSettings : penSettings} onChange={activeTool === 'highlighter' ? setHighlighterSettings : setPenSettings} onClose={() => { setColorPicker(null); setPenSettingsOpen(false) }} straightAssist={straightAssist} onStraightAssistChange={setStraightAssist} sheet={Boolean(sheet)} dragHandlers={sheet?.dragHandlers} />, [styles.penSettingsWrap, toolPopoverStyle()], { onClose: () => { setColorPicker(null); setPenSettingsOpen(false) } })
          )}
          {!readOnly && activeTool === 'eraser' && penSettingsOpen && !drawerTab && (
            renderPanel((sheet) => <EraserSettings size={eraserSize} onChange={setEraserSize} mode={eraserMode} onModeChange={setEraserMode} target={eraserTarget} onTargetChange={setEraserTarget} onClose={() => setPenSettingsOpen(false)} sheet={Boolean(sheet)} dragHandlers={sheet?.dragHandlers} />, [styles.penSettingsWrap, toolPopoverStyle()], { onClose: () => setPenSettingsOpen(false) })
          )}

          {showMore && !drawerTab && stageSize && (
            // 옵션 패널은 고른 요소 옆(가리지 않는 쪽)에 띄운다
            <View style={[styles.optionsWrap, optionsPlacement(selectedObjects, zoom, offset, stageSize, compact ? OPTIONS_TOP_PHONE : OPTIONS_TOP)]} pointerEvents="box-none" {...markInside}>
              <MorePanel objects={selectedObjects} dispatch={dispatch} onReplacePhoto={replacePhoto} onReplaceCell={replaceCell} onCropCell={startCrop} onClose={() => setMoreOpen(false)} />
            </View>
          )}

          {photoPanelVisible && (
            renderPanel((sheet) => <PhotoSourcePicker diary={diary} sheet={sheet} onClose={closePhotoPanel}
                onDevice={()=>{closePhotoPanel();addPhotos()}}
                onSelect={image=>{closePhotoPanel();addPhotos([image])}} />,
              [styles.drawerWrap, toolPopoverStyle(320)], { onClose: closePhotoPanel, fixedHeight: true })
          )}

          {drawerTab && (
            renderPanel((sheet) => <DecorDrawer
                onPanelWidth={setDrawerWidth}
                tab={drawerTab}
                // 테이프를 넣으면 보관함을 닫는다 (옵션 창은 자동으로 열지 않는다)
                onTapeInserted={closeAfterInsert}
                onAdd={addDecor}
                onToast={showToast}
                onClose={closeDrawer}
                sheet={sheet}
                photoLimit={photoLimit}
              />, [styles.drawerWrap, toolPopoverStyle(drawerWidth)], { onClose: closeDrawer, fixedHeight: true })
          )}

          {compactMenuLayout && <CompactMenu {...compactMenuLayout} actions={compactMenu.actions} insideHandlers={markInside} />}

          {/* 폰은 패널이 작업창 위를 덮으므로, 되돌리기·저장 상태 막대를 열린 패널의 반대쪽으로 옮긴다. */}
          {!readOnly && !hideUndoBar && <View style={[styles.floating, undoOnRight ? styles.floatingRight : styles.floatingLeft, undoOnRight && styles.floatingStacked, phoneSheet && sheetHeight > 0 && { bottom: sheetHeight + 4 }]}>
            <RoundButton icon="undo" label="되돌리기" disabled={readOnly || (textSync.enabled ? textSync.busy || (!localUndo&&!textSync.canUndo) : !state.past.length)} onPress={undo} />
            <View style={styles.floatingDivider} />
            <RoundButton icon="redo" label="다시 실행" disabled={readOnly || (textSync.enabled ? textSync.busy || (!localRedo&&!textSync.canRedo) : !state.future.length)} onPress={redo} />
            <View style={styles.floatingDivider} />
            {/* 기기 저장과 서버 전송을 한 칸에서 보인다(저장 중 · 저장됨 · 저장 안 됨). 서버 연결 실패면 눌러서 다시 시도 */}
            <SaveIndicator status={saveStatus} server={textSync.status ? { status: textSync.status, errorMessage: textSync.errorMessage, retry: textSync.retry } : null} onInfo={showToast} />
          </View>}

          {/* 맞춤 · 모드 전환은 작업창 안 오른쪽 아래(레이어 창이 열리면 그 왼쪽). 되돌리기 막대와 같은 떠 있는 막대 모양 */}
          {!readOnly && <ReadingModeControls
            controlsRef={modeControlsRef} onLayout={measureModeControls}
            style={phoneSheet && sheetHeight > 0 ? { bottom: sheetHeight + 4 } : null}
            reading={readOnly} canEdit={!permissionReadOnly} fitted={viewFitted} onFit={fitToScreen} onToggle={toggleReading}
          />}
          {readOnly && readerMenuVisible && <ReadingHeader title={state.doc.title} onHome={goHome} />}
          {readOnly && readerMenuVisible && <ReadingNavigation index={pageIndex} count={state.doc.pages.length} onSelect={selectReadingPage}
            controlsRef={modeControlsRef} onLayout={measureModeControls} canEdit={!permissionReadOnly} fitted={viewFitted} onFit={fitToScreen} onToggle={toggleReading} />}
          {photoCrop && (
            <PhotoCropper
              key={photoCrop.id}
              photo={photoCrop}
              // 칸 · 티켓은 글자 자리가 정해져 있어 비율을 바꾸지 않는다
              fixedAspect={fixedAspectOf(photoCrop)}
              title={photoCrop.cell != null ? `${photoCrop.cell + 1}번 칸 자르기` : undefined}
              onCancel={() => setPhotoCropId(null)}
              // aspect · rect 는 표지 · 프로필 · 테이프용 부가 정보라 사진 객체에 넣지 않는다
              onApply={({ aspect, rect, ...patch }) => {
                const cells = photoCrop.cell != null && photoCropTarget.cells.map((c, i) => (i === photoCrop.cell ? { ...c, crop: patch.crop } : c))
                dispatch({ type: 'updateObject', id: photoCropTarget.id, record: true, patch: cells ? { cells } : patch })
                setPhotoCropId(null)
                showToast('사진 자르기를 적용했어요.')
              }}
            />
          )}
          {cropAsk && (
            <PhotoCropper
              key={`ask-${cropAsk.photo.id}-${cropAsk.title ?? ''}`}
              photo={cropAsk.photo}
              fixedAspect={cropAsk.fixedAspect}
              title={cropAsk.title}
              onCancel={() => { cropAsk.resolve(null); setCropAsk(null) }}
              onApply={({ aspect, rect, ...patch }) => { cropAsk.resolve(patch); setCropAsk(null) }}
            />
          )}
          {tapeCrop && (
            <TapeCropper
              image={{ src: tapeCrop.src, mediaFileId: tapeCrop.mediaFileId, width: tapeCrop.imageWidth, height: tapeCrop.imageHeight }}
              initialCrop={tapeCrop.crop}
              ratio={tapePieceRatio(tapeCrop) ?? tapeCrop.w / tapeCrop.h}
              title="테이프 다시 자르기"
              confirmLabel="적용"
              onCancel={() => setTapeCropId(null)}
              onConfirm={({ crop }) => {
                dispatch({ type: 'updateObject', id: tapeCrop.id, record: true, patch: { crop } })
                setTapeCropId(null)
              }}
            />
          )}


          {toast && !exportJob && (
            <View key={toast.key} style={styles.toast} pointerEvents="none">
              <Text style={styles.toastText}>{toast.message}</Text>
            </View>
          )}
          {exportJob && (
            <View style={[styles.toast, styles.exportPill]} accessibilityLiveRegion="polite">
              <Text style={styles.toastText}>{exportJob.kind.toUpperCase()} 만드는 중 {Math.round(exportProgress * 100)}%</Text>
              <Pressable onPress={() => { setExportJob(null); showToast('내보내기를 취소했어요.') }} hitSlop={8} accessibilityRole="button" accessibilityLabel="내보내기 취소">
                <Icon name="close" size={14} color={colors.surface} />
              </Pressable>
            </View>
          )}
        </View>

        {showLayers && !readOnly && (
          renderSlot({ side: 'right', sideStyle: phoneLandscape ? styles.phonePanelLeft : styles.phonePanelRight,
            onWidth: (width) => setPhonePanelWidths((prev) => (phoneLandscape ? { ...prev, left: width } : { ...prev, right: width })), onClose: () => toggleLayers(false) },
            <LayerPanel
              objects={deferredObjects}
              selectedIds={state.selectedIds}
              dispatch={dispatch}
              onClose={() => toggleLayers(false)}
              onEmptyTap={clearSelection}
              width={compact ? (phoneLandscape ? LAYER_PANEL_WIDTH : LAYER_PANEL_COMPACT_WIDTH) : layerWidth}
              />)
        )}
        {phoneSheet && !readOnly && !phoneFocus && <PhoneCornerButtons pagesOpen={showPages} layersOpen={showLayers} onTogglePages={togglePages} onToggleLayers={switchLayers} />}
      </View>
      {phoneFocus && (
        <Pressable onPress={() => setFocusMode(false)} accessibilityRole="button" accessibilityLabel="집중 편집 모드 종료" style={[styles.focusExit, !landscape && styles.focusExitPortrait]}>
          <Icon name="focus" size={17} forText={12.5} />
          <Text style={styles.focusExitText}>집중 모드 종료</Text>
        </Pressable>
      )}
      {landscape && phoneToolbar}
      {colorPicker && <PresetColorEditor {...colorPicker}
        onDone={async color => { await colorPicker.onDone(color); setColorPicker(null) }}
        onClose={() => setColorPicker(null)} />}

    </View>
  )
}

/** 화면에 맞춤 위치: 리본바·하단 컨트롤 여백을 뺀 영역의 가운데 */
const BODY_GAP = 16 // 페이지 목록·작업창·레이어 사이 간격
const BODY_PADDING = 16 // styles.body 의 padding

// 폰에서만 패널을 작업창 위에 띄우는 틀로 감싼다. 태블릿은 감싸지 않아 기존 배치·겹침 순서를 그대로 쓴다.
function PhonePanelSlot({ compact, side, onWidth, children }) {
  if (!compact) return children
  return <View style={[styles.phonePanel, side]} pointerEvents="box-none" onLayout={(event) => onWidth?.(event.nativeEvent.layout.width)}>{children}</View>
}

function RoundButton({ icon, label, disabled, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.roundButton,
        active && styles.roundActive,
        pressed && styles.roundPressed,
        disabled && styles.roundDisabled,
      ]}
    >
      <Icon name={icon} size={19} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pageLoading: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 10, alignItems: 'center', justifyContent: 'center' },
  pageLoadingText: { fontSize: 14, color: colors.textMuted },
  root: { flex: 1, backgroundColor: colors.surfaceSoft },
  // 폰 가로 편집: 양옆 막대만큼 작업창을 비켜 둔다. 읽기는 양쪽 막대를 숨긴다.
  rootBetweenRails: { paddingLeft: PHONE_TOOLBAR_RAIL, paddingRight: PHONE_TOOLBAR_RAIL },
  focusExit: { position: 'absolute', top: 10, left: 10, zIndex: 30, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.95)', ...shadow.card },
  focusExitPortrait: { top: 72 },
  focusExitText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  body: { flex: 1, flexDirection: 'row', gap: BODY_GAP, padding: BODY_PADDING },
  bodyCompact: { padding: 8 },
  readingBody: { padding: 0, gap: 0 },
  // 폰: 페이지 목록·레이어는 작업창을 줄이지 않고 그 위에 띄운다.
  phonePanel: { position: 'absolute', top: 8, bottom: 8, zIndex: 20, flexDirection: 'row', ...shadow.float },
  phonePanelLeft: { left: 8 },
  phonePanelRight: { right: 8, maxWidth: '86%' },
  stage: { flex: 1, minWidth: 0, overflow: 'hidden', borderRadius: 16 },
  // 태블릿: 바깥 여백과 패널 사이 틈을 덮어 도구 줄 · 패널 · 화면 끝까지 채운다(틈과 바깥 여백이 같은 16이라 패널 여닫을 때 폭 계산은 그대로다)
  stageEdge: { margin: -BODY_PADDING, borderRadius: 0 },
  textPaletteWrap: { position: 'absolute', maxWidth: '100%' },
  textRangeWrap: { position: 'absolute', left: 8, right: 8, bottom: 8, alignItems: 'center' },
  lassoSettingsWrap: { position: 'absolute', top: 76, left: 12, right: 12, alignItems: 'center' },
  penSettingsWrap: { position: 'absolute', top: 76, left: 16, right: 16, bottom: 64, alignItems: 'flex-start' },
  // 보관함은 스테이지 안에서만 펼쳐지고, 내용이 길면 안에서 스크롤한다. (하단 확대 컨트롤은 가리지 않음)
  drawerWrap: { position: 'absolute', top: 76, right: 12, bottom: 64, left: 12, alignItems: 'flex-end' },
  optionsWrap: { position: 'absolute', width: OPTIONS_WIDTH },
  floating: {
    position: 'absolute',
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    ...shadow.card,
  },
  floatingLeft: { left: 12 },
  floatingRight: { right: 12 },
  // 오른쪽 실행 취소 바는 고정된 맞춤·모드 전환 버튼 위에 둔다.
  floatingStacked: { bottom: 76 },
  floatingDivider: { width: 1, height: 20, backgroundColor: colors.border },
  roundButton: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  roundActive: { backgroundColor: colors.primarySoft },
  roundPressed: {}, // 눌림 효과 없음(사용자 지시)
  roundDisabled: { opacity: DISABLED_OPACITY },
  toast: {
    position: 'absolute',
    bottom: 64,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.text,
  },
  toastText: { fontSize: 13, fontWeight: '700', color: colors.surface },
  exportPill: { flexDirection: 'row', alignItems: 'center', gap: 10 },
})
