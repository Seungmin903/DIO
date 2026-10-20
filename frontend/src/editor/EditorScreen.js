import { useCallback, useEffect, useRef, useState } from 'react'
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../theme'
import MediaNotice from './components/MediaNotice'
import { mediaFailureMessage } from './utils/mediaRecovery.js'
import PageExportPreview from './components/PageExportPreview'
import { createExportSnapshot } from './utils/pageExport.js'
import { pngFileName } from './utils/pngFileSave.js'
import Canvas from './components/Canvas'
import CropPanel from './components/CropPanel'
import DecorDrawer from './components/DecorDrawer'
import Icon from './components/Icon'
import LayerPanel from './components/LayerPanel'
import MorePanel from './components/MorePanel'
import PageList from './components/PageList'
import Ribbon from './components/Ribbon'
import SaveIndicator from './components/SaveIndicator'
import TapeCropper from './components/TapeCropper'
import TopBar from './components/TopBar'
import Viewport from './components/Viewport'
import { PAGE_HEIGHT, PAGE_WIDTH, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './constants'
import { useEditor } from './hooks/useEditor'
import { getCurrentPage } from './state/editorReducer'
import { clamp, createId } from './utils/common'
import { pickImages } from './utils/image'
import { createObjectFromDecor } from './utils/objects'

const TOAST_MS = 2000
// 캔버스 위아래로 리본바·하단 컨트롤이 겹치지 않게 비워 두는 여백
const STAGE_PADDING = { top: 84, bottom: 76, side: 28 }

// 전환 UI 확정 전까지 기본 편집 모드. 상위 화면에서 readOnly를 전달할 수 있다.
export default function EditorScreen({ readOnly = false }) {
  const { state, dispatch, saveStatus } = useEditor()
  const page = getCurrentPage(state)
  const pageIndex = state.doc.pages.indexOf(page)

  const [exportSnapshot, setExportSnapshot] = useState(null)
  const [stageSize, setStageSize] = useState(null)
  // scale: 화면에 맞춤 대비 배율, x·y: 페이지 왼쪽 위 위치 (null 이면 가운데)
  const [view, setView] = useState({ scale: 1, x: null, y: null })
  const [drawerTab, setDrawerTab] = useState(null)
  const [activeTool, setActiveTool] = useState('select')
  const [moreOpen, setMoreOpen] = useState(false)
  const [layersOpen, setLayersOpen] = useState(true)
  const [pagesOpen, setPagesOpen] = useState(true)
  const [focusMode, setFocusMode] = useState(false)
  const [cropId, setCropId] = useState(null)
  const [recentPhotos, setRecentPhotos] = useState([])
  const [importFailure, setImportFailure] = useState(null)
  const [toast, setToast] = useState(null)
  const [tapeCropId, setTapeCropId] = useState(null) // 다시 자르는 중인 이미지 테이프
  const tapStart = useRef(null)
  const clipboard = useRef([]) // Ctrl+C 로 복사한 오브젝트 (다른 페이지에도 붙여 넣기)

  useEffect(() => {
    if (!readOnly) return
    if (cropId) dispatch({ type: 'revertToCheckpoint' })
    setCropId(null)
    setTapeCropId(null)
    setDrawerTab(null)
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
  const offset = view.x == null ? centeredOffset(stageSize, zoom) : { x: view.x, y: view.y }

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
    const scale = clamp(nextScale, ZOOM_MIN, ZOOM_MAX)
    const z = fitZoom * scale
    setView({ scale, ...clampOffset({ x: screenPoint.x - pagePoint.x * z, y: screenPoint.y - pagePoint.y * z }, z) })
  }
  const panBy = (dx, dy) => setView((prev) => ({ scale: prev.scale, ...clampOffset({ x: offset.x + dx, y: offset.y + dy }, zoom) }))

  const cropTarget = cropId ? page.objects.find((o) => o.id === cropId && o.type === 'photo') : null
  const tapeCrop = tapeCropId ? page.objects.find((o) => o.id === tapeCropId && (o.src || o.mediaFileId) && o.imageWidth) : null
  const selectedObjects = page.objects.filter((o) => state.selectedIds.includes(o.id))
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

  // 버튼 확대·축소는 보는 영역 가운데 기준
  const changeZoom = (next) => {
    if (next === 'fit') {
      setView({ scale: 1, x: null, y: null })
      showToast('화면에 맞췄어요')
      return
    }
    const scale = clamp(Math.round(next * 100) / 100, ZOOM_MIN, ZOOM_MAX)
    const center = stageSize ? { x: stageSize.width / 2, y: stageSize.height / 2 } : { x: 0, y: 0 }
    zoomAround(scale, { x: (center.x - offset.x) / zoom, y: (center.y - offset.y) / zoom }, center)
    showToast(`${Math.round(scale * 100)}%`)
  }

  const randomCenter = () => ({
    x: PAGE_WIDTH / 2 + (Math.random() - 0.5) * 160,
    y: PAGE_HEIGHT / 2 + (Math.random() - 0.5) * 120,
  })

  const addDecor = (item) => {
    dispatch({ type: 'addObjects', objects: [createObjectFromDecor(item, randomCenter())] })
  }

  const addPhotos = async (style) => {
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
        createObjectFromDecor({ kind: 'photo', style, ...photo }, { x: center.x + index * 24, y: center.y + index * 24 }),
      )
      dispatch({ type: 'addObjects', objects })
    } catch (error) {
      showToast(mediaFailureMessage(error), () => addPhotos(style))
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

  const startCrop = (id) => {
    setDrawerTab(null)
    dispatch({ type: 'select', ids: [id] })
    dispatch({ type: 'checkpoint' })
    setCropId(id)
  }

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
    if (Platform.OS !== 'web' || readOnly || activeTool !== 'select') return undefined
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
    if (!cropId) dispatch({ type: 'select', ids: [] })
  }
  const emptyTap = {
    onStartShouldSetResponder: () => true,
    onResponderGrant: (event) => {
      tapStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
    },
    onResponderRelease: (event) => {
      const start = tapStart.current
      tapStart.current = null
      if (start && Math.hypot(event.nativeEvent.pageX - start.x, event.nativeEvent.pageY - start.y) < 8) clearSelection()
    },
  }

  const showPages = pagesOpen && !focusMode
  const showLayers = layersOpen && !focusMode

  return (
    <View style={styles.root}>
      <TopBar
        doc={state.doc}
        pageNumber={pageIndex + 1}
        layersOpen={showLayers}
        pagesOpen={showPages}
        focusMode={focusMode}
        readOnly={readOnly}
        onHome={() => showToast('다이어리 홈은 다른 화면에서 연결될 예정이에요.')}
        onCloseTab={() => showToast('다이어리 탭 닫기는 홈 화면과 함께 연결될 예정이에요.')}
        onTogglePages={() => {
          setFocusMode(false)
          setPagesOpen(!showPages)
        }}
        onToggleLayers={() => {
          setFocusMode(false)
          setLayersOpen(!showLayers)
        }}
        onToggleFocus={() => {
          setFocusMode(!focusMode)
          if (!focusMode) showToast('집중 편집 · 양옆 패널을 닫았어요.')
        }}
        shareLabel="PNG 내보내기"
        shareIcon="image"
        onShare={() => {
          if (exportSnapshot) return
          try { setExportSnapshot({ ...createExportSnapshot(page, { width: PAGE_WIDTH, height: PAGE_HEIGHT }), fileName: pngFileName(state.doc.title, state.doc.pages.findIndex((p) => p.id === page.id) + 1) }) }
          catch (error) { setExportSnapshot({ errorMessage: error.message }) }
        }}
      />

      {exportSnapshot && <PageExportPreview snapshot={exportSnapshot} onClose={() => setExportSnapshot(null)} />}
      <MediaNotice references={state.doc} importFailure={importFailure} onDismissImport={() => setImportFailure(null)} />
      {/* 흰 페이지 밖 어디든(패널 빈 곳·패널 사이 틈) 눌러도 선택을 푼다. 버튼·목록 항목은 자기 터치를 먼저 받는다. */}
      <View style={styles.body} {...emptyTap}>
        {showPages && (
          <PageList
            readOnly={readOnly}
            pages={state.doc.pages}
            currentId={page.id}
            cropId={cropTarget?.id ?? null}
            onMove={(id, toIndex) => dispatch({ type: 'movePage', id, toIndex })}
            onSelect={(id) => {
              if (cropId) finishCrop(false)
              dispatch({ type: 'selectPage', id })
            }}
            onAdd={() => dispatch({ type: 'addPage' })}
            onRemove={(id) => {
              dispatch({ type: 'removePage', id })
              showToast('페이지를 삭제했어요. 되돌리기로 복구할 수 있어요.')
            }}
          />
        )}

        <View style={styles.stage}>
          <Viewport
            zoom={zoom}
            scale={view.scale}
            offset={offset}
            onPinch={zoomAround}
            onPan={panBy}
            onTapEmpty={clearSelection}
            onLayout={(event) => setStageSize(event.nativeEvent.layout)}
          >
              <Canvas
                activeTool={activeTool}
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
                onReplacePhoto={replacePhoto}
                onToast={showToast}
              />
          </Viewport>

          {!readOnly && <View style={styles.ribbonWrap} pointerEvents="box-none">
            <Ribbon
              activeTool={activeTool}
              drawerTab={drawerTab}
              onOpenDrawer={(tab) => {
                if (cropId) finishCrop(false)
                setMoreOpen(false)
                setActiveTool('select')
                setDrawerTab(drawerTab === tab ? null : tab)
              }}
              onSelectTool={(tool) => {
                if (cropId) finishCrop(false)
                setTapeCropId(null)
                setDrawerTab(null)
                setMoreOpen(false)
                dispatch({ type: 'select', ids: [] })
                setActiveTool(tool)
              }}
              onPlaceholder={(label) => showToast(`${label}은(는) 다른 담당 기능이라 아직 연결하지 않았어요.`)}
            />
          </View>}

          {showMore && !drawerTab && (
            <View style={styles.drawerWrap} pointerEvents="box-none">
              <MorePanel objects={selectedObjects} dispatch={dispatch} onClose={() => setMoreOpen(false)} />
            </View>
          )}

          {drawerTab && (
            <View style={styles.drawerWrap} pointerEvents="box-none">
              <DecorDrawer
                tab={drawerTab}
                onTabChange={setDrawerTab}
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

          <View style={[styles.floating, styles.floatingRight]}>
            <RoundButton icon="minus" label="축소" disabled={view.scale <= ZOOM_MIN} onPress={() => changeZoom(view.scale - ZOOM_STEP)} />
            <Text style={styles.zoomValue}>{Math.round(view.scale * 100)}%</Text>
            <RoundButton icon="plus" label="확대" disabled={view.scale >= ZOOM_MAX} onPress={() => changeZoom(view.scale + ZOOM_STEP)} />
            <View style={styles.floatingDivider} />
            <RoundButton icon="fit" label="화면에 맞춤" active={fitted} onPress={() => changeZoom('fit')} />
          </View>

          {tapeCrop && (
            <TapeCropper
              image={{ src: tapeCrop.src, mediaFileId: tapeCrop.mediaFileId, width: tapeCrop.imageWidth, height: tapeCrop.imageHeight }}
              initialCrop={tapeCrop.crop}
              initialEdge={tapeCrop.edge}
              title="테이프 다시 자르기"
              confirmLabel="적용"
              onCancel={() => setTapeCropId(null)}
              onConfirm={({ crop, edge }) => {
                dispatch({ type: 'updateObject', id: tapeCrop.id, record: true, patch: { crop, edge } })
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

        {cropTarget ? (
          <CropPanel photo={cropTarget} dispatch={dispatch} onApply={() => finishCrop(true)} onCancel={() => finishCrop(false)} />
        ) : (
          showLayers && !readOnly && (
            <LayerPanel
              objects={page.objects}
              selectedIds={state.selectedIds}
              dispatch={dispatch}
              onClose={() => setLayersOpen(false)}
            />
          )
        )}
      </View>
    </View>
  )
}

/** 화면에 맞춤 위치: 리본바·하단 컨트롤 여백을 뺀 영역의 가운데 */
function centeredOffset(stageSize, zoom) {
  if (!stageSize) return { x: STAGE_PADDING.side, y: STAGE_PADDING.top }
  const available = stageSize.height - STAGE_PADDING.top - STAGE_PADDING.bottom
  return {
    x: (stageSize.width - PAGE_WIDTH * zoom) / 2,
    y: STAGE_PADDING.top + (available - PAGE_HEIGHT * zoom) / 2,
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
  body: { flex: 1, flexDirection: 'row', gap: 16, padding: 16 },
  stage: { flex: 1, minWidth: 0, overflow: 'hidden', borderRadius: 18 },
  ribbonWrap: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' },
  // 보관함은 스테이지 안에서만 펼쳐지고, 내용이 길면 안에서 스크롤한다. (하단 확대 컨트롤은 가리지 않음)
  drawerWrap: { position: 'absolute', top: 76, right: 12, bottom: 64, left: 12, alignItems: 'flex-end' },
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
  zoomValue: { minWidth: 52, textAlign: 'center', fontSize: 13, fontWeight: '800', color: colors.text },
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
