import { useCallback, useEffect, useRef, useState } from 'react'
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../shared/theme'
import MediaNotice from '../components/MediaNotice'
import { mediaFailureMessage } from '../utils/mediaRecovery.js'
import { createRegionExportSnapshot } from '../utils/regionExport.js'
import RegionExportSelector from '../components/RegionExportSelector'
import ExportMenu from '../components/ExportMenu'
import PageExportPreview from '../components/PageExportPreview'
import { createExportSnapshot } from '../utils/pageExport.js'
import { pngFileName } from '../utils/pngFileSave.js'
import Canvas from '../components/canvas/Canvas'
import PhotoCropper from '../components/panels/PhotoCropper'
import DecorDrawer from '../components/panels/DecorDrawer'
import Icon from '../components/controls/Icon'
import LayerPanel from '../components/panels/LayerPanel'
import MorePanel from '../components/panels/MorePanel'
import PageList, { PAGE_LIST_WIDTH } from '../components/panels/PageList'
import Ribbon from '../components/chrome/Ribbon'
import PenSettings from '../components/PenSettings'
import LassoSettings from '../components/LassoSettings'
import TextSettings from '../components/TextSettings'
import { DEFAULT_TEXT_SETTINGS, textSettings, textFormatPatch } from '../utils/text'
import { createText } from '../utils/text'
import { DEFAULT_PEN_SETTINGS, DEFAULT_HIGHLIGHTER_SETTINGS } from '../utils/penSettings'
import SaveIndicator from '../components/controls/SaveIndicator'
import TapeCropper from '../components/panels/TapeCropper'
import TapCatcher from '../components/controls/TapCatcher'
import TopBar from '../components/chrome/TopBar'
import Viewport from '../components/canvas/Viewport'
import { ZOOM_MAX, ZOOM_MIN } from '../constants'
import { useEditor } from '../hooks/useEditor'
import { getCurrentPage } from '../state/editorReducer'
import { clamp, createId, unionBounds } from '../utils/common'
import { pickImages } from '../services/image'
import { createObjectFromDecor } from '../utils/objects'

import TemplatePicker from '../components/TemplatePicker'
import { pageSize } from '../utils/pageGeometry.js'

const TOAST_MS = 2000
const ZOOM_HUD_MS = 900
// 캔버스 위아래로 리본바·하단 컨트롤이 겹치지 않게 비워 두는 여백
const STAGE_PADDING = { top: 84, bottom: 76, side: 28 }

// 상위 보관함에서 대상 다이어리와 읽기 전용 여부를 전달한다.
export default function EditorScreen({ onHome, onRenameDiary, diary, readOnly = false, onRegionExport }) {
  const { state, dispatch, saveStatus } = useEditor(diary)
  const page = getCurrentPage(state)
  const { width: PAGE_WIDTH, height: PAGE_HEIGHT } = pageSize(page)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)

  const [exportSnapshot, setExportSnapshot] = useState(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [regionOpen, setRegionOpen] = useState(false)
  const [stageSize, setStageSize] = useState(null)
  const stageRef = useRef(null)
  const [stageOrigin, setStageOrigin] = useState({ x: 0, y: 0 })
  // scale: 화면에 맞춤 대비 배율, x·y: 페이지 왼쪽 위 위치 (null 이면 가운데)
  const [view, setView] = useState({ scale: 1, x: null, y: null })
  const [drawerTab, setDrawerTab] = useState(null)
  const [activeTool, setActiveTool] = useState('select')
  const [lassoSettingsOpen, setLassoSettingsOpen] = useState(false)
  const [lasso, setLasso] = useState({ shape: 'rectangle', mode: 'replace' })
  useEffect(() => { setLasso(current => ({ ...current, mode: 'replace' })) }, [page.id])
  const [textEditing, setTextEditing] = useState(null)
  const textBoundary = useRef(null)
  const textPaletteBounds = useRef(null)
  const [textPalette, setTextPalette] = useState(null)
  const [textDefaults, setTextDefaults] = useState(DEFAULT_TEXT_SETTINGS)
  const [textSettingsOpen, setTextSettingsOpen] = useState(false)
  const [penSettings, setPenSettings] = useState(DEFAULT_PEN_SETTINGS)
  const [highlighterSettings, setHighlighterSettings] = useState(DEFAULT_HIGHLIGHTER_SETTINGS)
  const [penSettingsOpen, setPenSettingsOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [layersOpen, setLayersOpen] = useState(true)
  const [pagesOpen, setPagesOpen] = useState(true)
  const [focusMode, setFocusMode] = useState(false)
  const [cropId, setCropId] = useState(null)
  const [recentPhotos, setRecentPhotos] = useState([])
  const [importFailure, setImportFailure] = useState(null)
  const [toast, setToast] = useState(null)
  const [tapeCropId, setTapeCropId] = useState(null) // 다시 자르는 중인 이미지 테이프
  const [photoCropId, setPhotoCropId] = useState(null) // 자르기 창을 연 사진
  const clipboard = useRef([]) // Ctrl+C 로 복사한 오브젝트 (다른 페이지에도 붙여 넣기)

  useEffect(() => {
    if (!readOnly) return
    if (cropId) dispatch({ type: 'revertToCheckpoint' })
    setCropId(null)
    setTapeCropId(null)
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
          (stageSize.width - STAGE_PADDING.side * 2) / PAGE_WIDTH,
          (stageSize.height - STAGE_PADDING.top - STAGE_PADDING.bottom) / PAGE_HEIGHT,
        ),
      )
    : 0.6
  const zoom = fitZoom * view.scale
  const fitted = view.scale === 1 && view.x == null
  const offset = view.x == null ? centeredOffset(stageSize, zoom, PAGE_WIDTH, PAGE_HEIGHT) : { x: view.x, y: view.y }

  // 페이지가 화면 밖으로 다 사라지지 않게 가장자리 80px 은 남긴다.
  const clampOffset = (next, z) => {
    if (!stageSize) return next
    const keep = 80
    return {
      x: clamp(next.x, keep - PAGE_WIDTH * z, stageSize.width - keep),
      y: clamp(next.y, keep - PAGE_HEIGHT * z, stageSize.height - keep),
    }
  }
  // pagePoint(페이지 좌표)가 화면의 screenPoint 에 오도록 배율을 바꾼다. (손가락 사이·휠 위치 기준 확대)
  const zoomAround = (nextScale, pagePoint, screenPoint) => {
    showZoomHud()
    const scale = clamp(nextScale, ZOOM_MIN, ZOOM_MAX)
    const z = fitZoom * scale
    setView({ scale, ...clampOffset({ x: screenPoint.x - pagePoint.x * z, y: screenPoint.y - pagePoint.y * z }, z) })
  }
  const panBy = (dx, dy) => setView((prev) => ({ scale: prev.scale, ...clampOffset({ x: offset.x + dx, y: offset.y + dy }, zoom) }))

  const cropTarget = cropId ? page.objects.find((o) => o.id === cropId && o.type === 'photo') : null
  const tapeCrop = tapeCropId ? page.objects.find((o) => o.id === tapeCropId && (o.src || o.mediaFileId) && o.imageWidth) : null
  const selectedObjects = page.objects.filter((o) => state.selectedIds.includes(o.id))
  const selectedText = selectedObjects.length === 1 && selectedObjects[0].type === 'text' && !selectedObjects[0].locked ? selectedObjects[0] : null
  const currentTextSettings = textSettings(selectedText ?? textDefaults)
  const changeTextSettings = (patch) => {
    if (Object.entries(patch).every(([key, value]) => currentTextSettings[key] === value)) return
    const next = { ...currentTextSettings, ...patch }
    setTextDefaults(next)
    if (selectedText) dispatch({ type: 'updateObject', id: selectedText.id, record: true, patch: { ...textFormatPatch(selectedText, next), ...('color' in patch && { colorRanges: [] }) } })
  }
  const showMore = moreOpen && selectedObjects.length > 0 && !cropId

  const showToast = useCallback((message, retry) => {
    if (retry) setImportFailure({ message, retry })
    else setToast({ message, key: createId() })
  }, [setToast])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  // 자르던 사진이 되돌리기 등으로 사라지면 자르기를 끝낸다.
  if (cropId && !cropTarget) setCropId(null)

  // 확대·축소하는 동안에만 오른쪽 아래에 배율을 보여 주고, 손을 멈추면 잠시 뒤 숨긴다.
  const [zoomHud, setZoomHud] = useState(false)
  const hudTimer = useRef(null)
  const showZoomHud = () => {
    setZoomHud(true)
    clearTimeout(hudTimer.current)
    hudTimer.current = setTimeout(() => setZoomHud(false), ZOOM_HUD_MS)
  }
  useEffect(() => () => clearTimeout(hudTimer.current), [])
  const fitToScreen = () => setView({ scale: 1, x: null, y: null })

  const randomCenter = () => ({
    x: PAGE_WIDTH / 2 + (Math.random() - 0.5) * 160,
    y: PAGE_HEIGHT / 2 + (Math.random() - 0.5) * 120,
  })

  const addDecor = (item) => {
    const object = createObjectFromDecor(item, randomCenter())
    dispatch({ type: 'addObjects', objects: [object] })
    // 사진은 붙이자마자 자르기를 연다 (틀·모양·영역을 여기서 고른다)
    if (object.type === 'photo') startCrop(object.id)
  }

  const addPhotos = async () => {
    try {
      setImportFailure(null)
      const images = await pickImages()
      if (!images.length) return
      const photos = images.map((image) => ({
        id: createId(),
        src: image.src,
        mediaFileId: image.mediaFileId,
        poster: image.poster,
        name: image.name,
        imageWidth: image.width,
        imageHeight: image.height,
      }))
      setRecentPhotos((prev) => [...photos, ...prev].slice(0, 12))
      const center = randomCenter()
      const objects = photos.map((photo, index) =>
        createObjectFromDecor({ kind: 'photo', ...photo }, { x: center.x + index * 24, y: center.y + index * 24 }),
      )
      dispatch({ type: 'addObjects', objects })
      // 한 장이면 붙이자마자 자르기를 연다 (틀·모양·영역을 여기서 고른다)
      if (objects.length === 1) startCrop(objects[0].id)
    } catch (error) {
      showToast(mediaFailureMessage(error), () => addPhotos())
    }
  }

  // 틀·자르기 설정은 두고 사진만 바꾼다.
  const replacePhoto = async (id) => {
    try {
      setImportFailure(null)
      const [image] = await pickImages({ multiple: false })
      if (!image) return
      dispatch({
        type: 'updateObject',
        id,
        record: true,
        patch: {
          src: image.src,
          mediaFileId: image.mediaFileId,
          poster: image.poster,
          name: image.name,
          imageWidth: image.width,
          imageHeight: image.height,
          crop: { fx: 0.5, fy: 0.5, zoom: 1 },
        },
      })
      showToast('사진을 바꿨어요.')
    } catch (error) {
      showToast(mediaFailureMessage(error), () => replacePhoto(id))
    }
  }

  // 사진 자르기: 화면 가운데 자르기 창을 연다. '적용'할 때만 사진이 바뀐다.
  const startCrop = (id) => {
    setDrawerTab(null)
    setMoreOpen(false)
    dispatch({ type: 'select', ids: [id] })
    setPhotoCropId(id)
  }
  const photoCrop = photoCropId ? page.objects.find((o) => o.id === photoCropId && o.type === 'photo') : null

  const finishCrop = (apply) => {
    if (!apply) dispatch({ type: 'revertToCheckpoint' })
    setCropId(null)
    showToast(apply ? '사진 자르기를 적용했어요.' : '자르기를 취소했어요.')
  }

  const undo = () => {
    if (!state.past.length) return
    if (cropId) setCropId(null)
    dispatch({ type: 'undo' })
    showToast('마지막 작업을 되돌렸어요.')
  }

  const redo = () => {
    if (!state.future.length) return
    dispatch({ type: 'redo' })
    showToast('다시 실행했어요.')
  }

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
        clipboard.current = selected
        if (key === 'x') dispatch({ type: 'removeObjects', ids: editable.map((o) => o.id) })
        showToast(key === 'x' ? '잘라 냈어요.' : `${selected.length}개를 복사했어요.`)
      } else if (mod && key === 'v' && clipboard.current.length) {
        event.preventDefault()
        dispatch({ type: 'pasteObjects', objects: clipboard.current })
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

  // 툴바에서 연 창(보관함·더보기·펜/텍스트/올가미 설정)은 창이나 툴바가 아닌 곳을 누르면 닫는다.
  // 터치를 가로채지 않고(목록 스크롤과 다투지 않게) 누른 위치만 본다:
  // 창·툴바 안의 터치는 그 영역이 먼저 표시하고, 바깥(root)에서는 표시가 없을 때만 닫는다.
  const bubbleOpen = Boolean(drawerTab || showMore || penSettingsOpen || textSettingsOpen || (activeTool === 'lasso' && lassoSettingsOpen))
  const touchInside = useRef(false)
  const pressEvent = Platform.OS === 'web' ? 'onPointerDown' : 'onTouchStart'
  const markInside = { [pressEvent]: () => (touchInside.current = true) }
  const closeOnOutside = {
    [pressEvent]: () => {
      if (bubbleOpen && !touchInside.current) {
        setDrawerTab(null)
        setMoreOpen(false)
        setPenSettingsOpen(false)
        setLassoSettingsOpen(false)
        setTextSettingsOpen(false)
      }
      touchInside.current = false
    },
  }

  const showPages = pagesOpen && !focusMode
  const showLayers = layersOpen && !focusMode

  return (
    <View style={styles.root} {...closeOnOutside} onStartShouldSetResponderCapture={(event) => Boolean(textEditing && textBoundary.current?.(event))} onResponderTerminationRequest={() => false}>
      <TopBar
        doc={state.doc}
        onRename={(title) => {
          dispatch({ type: 'renameDoc', title })
          onRenameDiary?.(title)
        }}
        layersOpen={showLayers}
        pagesOpen={showPages}
        focusMode={focusMode}
        onHome={() => {
          if (onHome) onHome()
          else showToast('다이어리 홈은 다른 화면에서 연결될 예정이에요.')
        }}
        onCloseTab={() => {
          if (onHome) onHome()
          else showToast('다이어리 홈은 다른 화면에서 연결될 예정이에요.')
        }}
        readOnly={readOnly}
        onTogglePages={() => {
          setFocusMode(false)
          setPagesOpen(!showPages)
          // 작업창 왼쪽 끝이 움직이므로 새 크기를 같은 화면에서 바로 써서 한 번에 맞춘다.
          // (측정값을 기다리면 페이지가 왼쪽 끝을 따라 한 번 밀렸다가 다시 가운데로 와서 두 번 움직였다)
          const delta = PAGE_LIST_WIDTH + BODY_GAP
          setStageSize((prev) => prev && { ...prev, width: prev.width + (showPages ? delta : -delta) })
        }}
        onToggleLayers={() => {
          setFocusMode(false)
          setLayersOpen(!showLayers)
        }}
        onToggleFocus={() => {
          setFocusMode(!focusMode)
          if (!focusMode) showToast('집중 편집 · 양옆 패널을 닫았어요.')
        }}
        shareLabel="공유 및 내보내기"
        shareIcon="share"
        onShare={() => {
          if (cropId || tapeCropId) { showToast('자르기를 마친 뒤 내보내 주세요.'); return }
          Keyboard.dismiss()
          setExportOpen(true)
        }}
      />

      {exportOpen && <ExportMenu doc={state.doc} currentId={page.id} onClose={() => setExportOpen(false)} onRegion={onRegionExport ?? (() => { setExportOpen(false); setRegionOpen(true) })} onPng={(id) => {
        const target = state.doc.pages.find((p) => p.id === id)
        setExportOpen(false)
        try { setExportSnapshot({ ...createExportSnapshot(target), fileName: pngFileName(state.doc.title, state.doc.pages.findIndex((p) => p.id === id) + 1) }) }
        catch (error) { setExportSnapshot({ errorMessage: error.message }) }
      }} />}
      {regionOpen && <RegionExportSelector page={page} visible={!exportSnapshot} onConfirm={(selection) => {
        setExportSnapshot(createRegionExportSnapshot(page, { ...selection, pageWidth: PAGE_WIDTH, pageHeight: PAGE_HEIGHT, title: state.doc.title, pageNumber: state.doc.pages.findIndex((p) => p.id === page.id) + 1 }))
      }} onCancel={() => { setRegionOpen(false); setExportOpen(true) }} />}
      {exportSnapshot && <PageExportPreview snapshot={exportSnapshot} onReselect={exportSnapshot.region ? () => setExportSnapshot(null) : undefined} onClose={() => { setExportSnapshot(null); setRegionOpen(false) }} />}
      {templatePickerOpen && !readOnly && <TemplatePicker onClose={() => setTemplatePickerOpen(false)} onSelect={(backgroundAssetId) => { dispatch({ type: 'addPage', backgroundAssetId }); setTemplatePickerOpen(false); fitToScreen() }} />}
      <MediaNotice references={state.doc} importFailure={importFailure} onDismissImport={() => setImportFailure(null)} />
      <View style={styles.body}>
        {/* 패널 사이 틈을 누르면 선택 해제. 패널·목록을 감싸지 않고 뒤에 깔아 둔다. (감싸면 Android 목록 스크롤이 잘 안 먹음) */}
        <TapCatcher onTap={clearSelection} style={StyleSheet.absoluteFill} />
        {showPages && (
          <PageList
            readOnly={readOnly}
            pages={state.doc.pages}
            currentId={page.id}
            cropId={cropTarget?.id ?? null}
            onMove={(id, toIndex) => dispatch({ type: 'movePage', id, toIndex })}
            onEmptyTap={clearSelection}
            onSelect={(id) => {
              if (cropId) finishCrop(false)
              dispatch({ type: 'selectPage', id })
            }}
            onAdd={() => { if (cropId) finishCrop(false); setTemplatePickerOpen(true) }}
            onRemove={(id) => {
              dispatch({ type: 'removePage', id })
              showToast('페이지를 삭제했어요. 되돌리기로 복구할 수 있어요.')
            }}
          />
        )}

        <View ref={stageRef} collapsable={false} style={styles.stage}
          onLayout={() => stageRef.current?.measureInWindow((x, y) => setStageOrigin({ x, y }))}>
          <Viewport
            zoom={zoom}
            scale={view.scale}
            offset={offset}
            onPinch={zoomAround}
            onPan={panBy}
            onTapEmpty={clearSelection}
            dragToPan={activeTool === 'hand'}
            onLayout={(event) => { setStageSize(event.nativeEvent.layout); stageRef.current?.measureInWindow((x, y) => setStageOrigin({ x, y })) }}
          >
              <Canvas
                activeTool={activeTool}
                lassoShape={lasso.shape}
                lassoMode={lasso.mode}
                onLassoCommit={(ids) => {
                  dispatch({ type: 'selectExact', ids })
                  if (!ids.length) setLasso(current => ({ ...current, mode: 'replace' }))
                }}
                onLassoModeChange={(mode) => setLasso(current => ({ ...current, mode: current.mode === mode ? 'replace' : mode }))}
                penSettings={penSettings}
                highlighterSettings={highlighterSettings}
                textBoundary={textBoundary}
                onTextPaletteChange={setTextPalette}
                textPaletteBounds={textPaletteBounds}
                textEditing={textEditing?.pageId === page.id ? textEditing : null}
                onEditText={(object) => { setTextSettingsOpen(false); setTextEditing({ ...object, pageId: page.id, existing: true }) }}
                onCancelText={() => setTextEditing(null)}
                onSaveText={(text, colorRanges = []) => {
        if (textEditing.pageId === page.id) {
          if (textEditing.existing) {
            if (text !== textEditing.text || JSON.stringify(colorRanges) !== JSON.stringify(textEditing.colorRanges ?? [])) {
              if (!text.trim()) dispatch({ type: 'removeObjects', ids: [textEditing.id] })
              else dispatch({ type: 'updateObject', id: textEditing.id, record: true, patch: { ...textFormatPatch({ ...textEditing, text }, textSettings(textEditing)), colorRanges } })
            }
          } else if (text.trim()) dispatch({ type: 'addObjects', objects: [createText({ ...textEditing, text, colorRanges })] })
        }
        setTextEditing(null)
        setActiveTool('select')
      }}
                onCreateText={(box) => { setTextSettingsOpen(false); setTextEditing({ ...box, ...textDefaults, id: createId(), pageId: page.id, text: '' }) }}
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
                onToast={showToast}
                contextBarInside={markInside}
              />
          </Viewport>

          {!readOnly && <View style={styles.ribbonWrap} pointerEvents="box-none" {...markInside}>
            <Ribbon
              activeTool={activeTool}
              drawerTab={drawerTab}
              onOpenDrawer={(tab) => {
                setLassoSettingsOpen(false)
                setTextSettingsOpen(false)
                setPenSettingsOpen(false)
                if (cropId) finishCrop(false)
                setMoreOpen(false)
                setActiveTool('select')
                setDrawerTab(drawerTab === tab ? null : tab)
              }}
              onSelectTool={(tool) => {
                setLassoSettingsOpen(tool === 'lasso' ? tool !== activeTool || !lassoSettingsOpen : false)
                setTextSettingsOpen(tool === 'text' ? !textSettingsOpen : false)
                setPenSettingsOpen(['pen', 'highlighter'].includes(tool) ? tool !== activeTool || !penSettingsOpen : false)
                if (cropId) finishCrop(false)
                setTapeCropId(null)
                setDrawerTab(null)
                setMoreOpen(false)
                const keepSelection = tool === 'text' || tool === 'lasso' || (activeTool === 'lasso' && tool === 'select')
                if (!keepSelection) dispatch({ type: 'select', ids: [] })
                if (tool === 'lasso' || (activeTool === 'lasso' && tool === 'select')) {
                  setTextEditing(null)
                  if (activeTool !== 'lasso') setLasso({ shape: 'rectangle', mode: 'replace' })
                }
                setActiveTool(tool)
              }}
              onPlaceholder={(label) => showToast(`${label}은(는) 다른 담당 기능이라 아직 연결하지 않았어요.`)}
            />
          </View>}
          {!readOnly && activeTool === 'lasso' && lassoSettingsOpen && !drawerTab && (
            <View style={styles.lassoSettingsWrap} pointerEvents="box-none" {...markInside}>
              <LassoSettings shape={lasso.shape} onClose={() => setLassoSettingsOpen(false)}
                onShapeChange={(shape) => setLasso(current => ({ ...current, shape }))} />
            </View>
          )}
          {!readOnly && textEditing && textPalette && <View style={[styles.textPaletteWrap, {
            left: Math.max(8, Math.min((textPalette.anchor?.x ?? stageOrigin.x) - stageOrigin.x, (stageSize?.width ?? 600) - 268)),
            top: Math.max(84, Math.min((textPalette.anchor?.y ?? stageOrigin.y) - stageOrigin.y + (textPalette.anchor?.height ?? 0) + 6, (stageSize?.height ?? 500) - 164)),
          }]} {...markInside}>
            {textPalette.content}
          </View>}
          {!readOnly && textSettingsOpen && !textEditing && !drawerTab && (
            <View style={[styles.penSettingsWrap, { left: Math.max(8, Math.min((stageSize?.width ?? 600) / 2 - 30, (stageSize?.width ?? 600) - 288)), right: 8 }]} pointerEvents="box-none" {...markInside}>
              <TextSettings settings={currentTextSettings} onChange={changeTextSettings} />
            </View>
          )}
          {!readOnly && ['pen', 'highlighter'].includes(activeTool) && penSettingsOpen && !drawerTab && (
            <View style={styles.penSettingsWrap} pointerEvents="box-none" {...markInside}>
              <PenSettings key={activeTool} settings={activeTool === 'highlighter' ? highlighterSettings : penSettings} onChange={activeTool === 'highlighter' ? setHighlighterSettings : setPenSettings} onClose={() => setPenSettingsOpen(false)} />
            </View>
          )}

          {showMore && !drawerTab && stageSize && (
            // 옵션 패널은 고른 요소 옆(가리지 않는 쪽)에 띄운다
            <View style={[styles.optionsWrap, optionsPlacement(selectedObjects, zoom, offset, stageSize)]} pointerEvents="box-none" {...markInside}>
              <MorePanel objects={selectedObjects} dispatch={dispatch} onReplacePhoto={replacePhoto} onClose={() => setMoreOpen(false)} />
            </View>
          )}

          {drawerTab && (
            <View style={styles.drawerWrap} pointerEvents="box-none" {...markInside}>
              <DecorDrawer
                tab={drawerTab}
                // 테이프를 넣으면 보관함을 닫고 그 테이프 옆에 옵션 패널을 연다
                onTapeInserted={() => {
                  setDrawerTab(null)
                  setMoreOpen(true)
                }}
                onAdd={addDecor}
                onAddPhotos={addPhotos}
                recentPhotos={recentPhotos}
                onToast={showToast}
                onClose={() => setDrawerTab(null)}
              />
            </View>
          )}

          <View style={[styles.floating, styles.floatingLeft]}>
            <RoundButton icon="undo" label="되돌리기" disabled={readOnly || !state.past.length} onPress={undo} />
            <View style={styles.floatingDivider} />
            <RoundButton icon="redo" label="다시 실행" disabled={readOnly || !state.future.length} onPress={redo} />
            <View style={styles.floatingDivider} />
            <SaveIndicator status={saveStatus} onInfo={showToast} />
          </View>

          {/* 배율 숫자는 확대·축소하는 동안에만, 맞춤 버튼은 화면에 맞춘 상태가 아닐 때만 보인다. */}
          {(zoomHud || !fitted) && (
            <View style={[styles.floating, styles.floatingRight]} pointerEvents="box-none">
              {zoomHud && <Text style={styles.zoomValue}>{Math.round(view.scale * 100)}%</Text>}
              {zoomHud && !fitted && <View style={styles.floatingDivider} />}
              {!fitted && <RoundButton icon="fit" label="화면에 맞춤" onPress={fitToScreen} />}
            </View>
          )}

          {photoCrop && (
            <PhotoCropper
              key={photoCrop.id}
              photo={photoCrop}
              onCancel={() => setPhotoCropId(null)}
              onApply={(patch) => {
                dispatch({ type: 'updateObject', id: photoCrop.id, record: true, patch })
                setPhotoCropId(null)
                showToast('사진 자르기를 적용했어요.')
              }}
            />
          )}
          {tapeCrop && (
            <TapeCropper
              image={{ src: tapeCrop.src, mediaFileId: tapeCrop.mediaFileId, width: tapeCrop.imageWidth, height: tapeCrop.imageHeight }}
              initialCrop={tapeCrop.crop}
              ratio={(tapeCrop.segmentW ?? tapeCrop.w) / tapeCrop.h}
              title="테이프 다시 자르기"
              confirmLabel="적용"
              onCancel={() => setTapeCropId(null)}
              onConfirm={({ crop }) => {
                dispatch({ type: 'updateObject', id: tapeCrop.id, record: true, patch: { crop } })
                setTapeCropId(null)
              }}
            />
          )}

          {toast && (
            <View key={toast.key} style={styles.toast} pointerEvents="none">
              <Text style={styles.toastText}>{toast.message}</Text>
            </View>
          )}
        </View>

        {showLayers && !readOnly && (
            <LayerPanel
              objects={page.objects}
              selectedIds={state.selectedIds}
              dispatch={dispatch}
              onClose={() => setLayersOpen(false)}
              onEmptyTap={clearSelection}
              />
        )}
      </View>
    </View>
  )
}

/** 화면에 맞춤 위치: 리본바·하단 컨트롤 여백을 뺀 영역의 가운데 */
const BODY_GAP = 16 // 페이지 목록·작업창·레이어 사이 간격
const OPTIONS_WIDTH = 300
const OPTIONS_GAP = 16
const OPTIONS_TOP = 76 // 툴바 아래부터
const OPTIONS_MARGIN = 12
const OPTIONS_BOTTOM = 64 // 아래쪽 되돌리기 바 위까지
const CONTEXT_BAR_HALF = 180 // 요소 아래·위에 뜨는 편집 바 폭의 절반 (바도 가리지 않게)

/**
 * 옵션 패널 자리: 고른 요소의 화면 상자 오른쪽에 자리가 있으면 오른쪽, 없으면 왼쪽,
 * 둘 다 모자라면 더 넓은 쪽 가장자리에 붙인다. 위쪽은 요소 위 끝에 맞추되 화면 안으로.
 */
function optionsPlacement(objects, zoom, offset, stage) {
  const b = unionBounds(objects)
  const cx = offset.x + b.cx * zoom
  // 요소와 그 아래·위의 편집 바를 함께 피한다
  const rect = {
    left: Math.min(offset.x + b.left * zoom, cx - CONTEXT_BAR_HALF),
    right: Math.max(offset.x + b.right * zoom, cx + CONTEXT_BAR_HALF),
    top: offset.y + b.top * zoom,
  }
  const roomRight = stage.width - OPTIONS_MARGIN - rect.right
  const roomLeft = rect.left - OPTIONS_MARGIN
  const need = OPTIONS_WIDTH + OPTIONS_GAP
  let left
  if (roomRight >= need) left = rect.right + OPTIONS_GAP
  else if (roomLeft >= need) left = rect.left - need
  else left = roomRight >= roomLeft ? stage.width - OPTIONS_MARGIN - OPTIONS_WIDTH : OPTIONS_MARGIN
  left = clamp(left, OPTIONS_MARGIN, Math.max(OPTIONS_MARGIN, stage.width - OPTIONS_MARGIN - OPTIONS_WIDTH))
  const minHeight = Math.min(420, stage.height - OPTIONS_TOP - OPTIONS_BOTTOM)
  const top = clamp(rect.top, OPTIONS_TOP, Math.max(OPTIONS_TOP, stage.height - OPTIONS_BOTTOM - minHeight))
  return { left, top, height: stage.height - OPTIONS_BOTTOM - top }
}

function centeredOffset(stageSize, zoom, pageWidth, pageHeight) {
  if (!stageSize) return { x: STAGE_PADDING.side, y: STAGE_PADDING.top }
  const available = stageSize.height - STAGE_PADDING.top - STAGE_PADDING.bottom
  return {
    x: (stageSize.width - pageWidth * zoom) / 2,
    y: STAGE_PADDING.top + (available - pageHeight * zoom) / 2,
  }
}

function RoundButton({ icon, label, disabled, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
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
  root: { flex: 1, backgroundColor: colors.surfaceSoft },
  body: { flex: 1, flexDirection: 'row', gap: BODY_GAP, padding: 16 },
  stage: { flex: 1, minWidth: 0, overflow: 'hidden', borderRadius: 18 },
  textPaletteWrap: { position: 'absolute', maxWidth: '100%' },
  ribbonWrap: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' },
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
    gap: 2,
    padding: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    ...shadow.card,
  },
  floatingLeft: { left: 12 },
  floatingRight: { right: 12 },
  floatingDivider: { width: 1, height: 20, backgroundColor: colors.border },
  zoomValue: { minWidth: 52, lineHeight: 36, textAlign: 'center', fontSize: 13, fontWeight: '800', color: colors.text },
  roundButton: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  roundActive: { backgroundColor: colors.surfaceSoft },
  roundPressed: { backgroundColor: colors.primarySoft },
  roundDisabled: { opacity: 0.3 },
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
})
