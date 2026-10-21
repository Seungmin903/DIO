import { useEffect, useRef, useState } from 'react'
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Icon from '../controls/Icon'
import { colors } from '../../../shared/theme'
import { PHOTO_SHAPES } from '../../constants'
import { usePan } from '../../hooks/usePan'
import { expandGroups } from '../../state/editorReducer'
import { centerOf, clamp, rotateVector, unionBounds } from '../../utils/common'
import { isMultiSelectKey } from '../../utils/modifiers'
import { coverLayout, photoInnerBox } from '../../utils/objects'
import { pageSize } from '../../utils/pageGeometry.js'
import { createLassoOutline, resolveLassoOutline } from '../../utils/lassoOutline.js'
import PageBackground from '../PageBackground'
import ContextBar from './ContextBar'
import CropHandles from './CropHandles'
import LassoOutline from './LassoOutline'
import StaticPage from './StaticPage'
import SelectionOverlay from './SelectionOverlay'
import PenInput from '../PenInput'
import EraserInput from '../EraserInput'
import LassoInput from '../LassoInput'
import TextEditor from '../TextEditor'
import TextBoxInput from '../TextBoxInput'
import TextLinkOverlay from '../TextLinkOverlay'
import PalmRejectionArea from './PalmRejectionArea'
import GridOverlay, { DEFAULT_GUIDES, hasGuides } from './GridOverlay'
import PaperColorSettings from '../PaperColorSettings'
import { LinkBadges, ObjectLinkOverlay } from './ObjectLinks'

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
  showBackground = true,
  page,
  zoom,
  selectedIds,
  cropId,
  dispatch,
  moreOpen,
  onToggleMore,
  contextBarInside,
  onCrop,
  onToast,
  activeTool = 'select',
  inputBlocker = null, // 툴바에서 연 창이 열려 있을 때 캔버스 터치를 대신 받을 핸들러 (그 터치로 그리지 않는다)
  penSettings,
  highlighterSettings,
  straightAssist = true,
  eraserSize,
  eraserMode = 'stroke',
  lassoShape = 'rectangle',
  lassoMode = 'replace',
  onLassoCommit,
  onLassoModeChange,
  onCreateText,
  onEditText,
  onTextSettings,
  onCopy,
  onCut,
  onPaste,
  canPaste,
  paperAppearance, // 지금 페이지 속지 색 { backgroundColor, layoutColor }
  onPaperAppearance, // (appearance, all) => 속지 색 바꾸기
  onCopyText,
  onTextLink,
  onObjectLink,
  onCopyLink,
  linkBadges = true, // 링크가 걸린 요소에 배지 표시
  textSettingsOpen = false, // 텍스트 서식 창이 열려 있음 (선택 바의 '서식' 버튼 표시)
  gridGuides = DEFAULT_GUIDES, // 격자·보조선 표시 (편집 화면에만. 끌 때 뜨는 맞춤선 guides 와 다르다)
  textEditing,
  textBoundary,
  onRevealText, // (dy) 키보드에 가린 글상자가 보이게 화면을 올린다
  onTextPaletteChange,
  textPaletteBounds,
  onSaveText,
  onCancelText,
  readOnly = false,
}) {
  const { width: PAGE_WIDTH, height: PAGE_HEIGHT } = pageSize(page)
  const [lassoDrawing, setLassoDrawing] = useState(false)
  const [lassoCapture, setLassoCapture] = useState(false)
  const [lassoOutline, setLassoOutline] = useState(null)
  const outlinePaths = activeTool === 'lasso' && lassoShape === 'freeform'
    ? resolveLassoOutline(lassoOutline, page.id, selectedIds, page.objects) : null
  useEffect(() => {
    if (lassoOutline && !outlinePaths) setLassoOutline(null)
  }, [lassoOutline, outlinePaths])
  useEffect(() => { setLassoDrawing(false); setLassoCapture(false) }, [page.id, activeTool])
  const [guides, setGuides] = useState(null)
  const [rotationLabel, setRotationLabel] = useState(null)
  const [interacting, setInteracting] = useState(false)
  const [draggingIds, setDraggingIds] = useState(null) // 끌어서 옮기는 중인 스티커·테이프·사진 (놓기 전까지 반투명)
  // 텍스트 상자 높이를 실제로 그려진 줄 수에 맞춘다. 되돌리기 이력에는 남기지 않는다. (크기 조절·편집 중에는 그쪽이 높이를 정한다)
  const fitTextHeight = (id, h) => {
    const object = page.objects.find((o) => o.id === id)
    if (object?.type === 'text' && h > 0 && Math.abs(object.h - h) > 1) dispatch({ type: 'updateObject', id, patch: { h } })
  }
  const [erasingIds, setErasingIds] = useState([])
  const [erasingPieces, setErasingPieces] = useState(null) // 영역 지우기 중: 원래 획 id → 남은 조각
  const previewErase = (ids, pieces = null) => { setErasingIds(ids); setErasingPieces(pieces) }
  // 그림 층에서 빼는 요소: 지우개로 지우는 중인 획, 편집 중인 텍스트(입력창이 투명이라 원래 글자가 겹쳐 보이지 않게)
  const hiddenIds = [...(activeTool === 'eraser' ? erasingIds : []), ...(textEditing?.id ? [textEditing.id] : [])]
  const pieces = activeTool === 'eraser' ? erasingPieces : null
  const hiddenSet = new Set(hiddenIds)
  const drawingPage = hiddenIds.length
    ? { ...page, objects: page.objects.flatMap((object) => pieces?.[object.id] ?? (hiddenSet.has(object.id) ? [] : [object])) }
    : page
  const visible = page.objects.filter((o) => !o.hidden)
  const touchSelectable = visible.filter((o) => o.type !== 'stroke')
  const selected = visible.filter((o) => selectedIds.includes(o.id))
  const lassoEditing = activeTool === 'lasso' && selected.length > 0 && !lassoDrawing && !lassoCapture
  const canSelect = !readOnly && !textEditing && (activeTool === 'select' || lassoEditing)
  // 텍스트 도구에서도 글자는 선택 도구처럼 누르면 선택, 다시 누르면 수정, 끌면 이동한다. (빈 곳을 누르면 새 글상자)
  const textTool = !readOnly && !textEditing && activeTool === 'text'
  const canTouch = canSelect || textTool
  const replacingLasso = activeTool === 'lasso' && lassoDrawing && lassoMode === 'replace'
  const showSelection = !replacingLasso && (canTouch || (!readOnly && !textEditing && activeTool === 'lasso'))
  const cropping = Boolean(cropId)
  // 사각·라운드 사진은 PPT 처럼 테두리 손잡이로 자유롭게 자른다.
  const freeCropTarget = visible.find(
    (o) => o.id === cropId && o.frame === 'shape' && !PHOTO_SHAPES.find((s) => s.id === o.shape)?.square,
  )

  const [marquee, setMarquee] = useState(null) // 논리 좌표 { left, top, right, bottom }
  const marqueeRef = useRef(null)
  // 빈 곳을 길게 누르면 뜨는 메뉴: 붙여넣기 · 속지 색. { x, y } 는 페이지 좌표, panel: 'paper' 면 그 자리에 속지 색 말풍선
  const [emptyMenu, setEmptyMenu] = useState(null)
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
      const near = start && nearestObject(touchSelectable, start, TAP_SLOP_PX / zoom)
      dispatch({ type: 'select', ids: near && !selectedIds.includes(near.id) ? [near.id] : [] })
    },
  })

  const guideUnderlay = !readOnly && hasGuides(gridGuides) ? <>
    <GridOverlay guides={gridGuides} layer="grid" width={PAGE_WIDTH} height={PAGE_HEIGHT} zoom={zoom} />
    <GridOverlay guides={gridGuides} layer="guides" width={PAGE_WIDTH} height={PAGE_HEIGHT} zoom={zoom} />
  </> : null

  return (
    <View
      accessibilityLabel={readOnly ? '다이어리 읽기 캔버스' : `${{ hand: '손바닥', select: '선택', pen: '펜', highlighter: '형광펜', eraser: '지우개', text: '텍스트', lasso: '올가미' }[activeTool]} 캔버스`}
      style={[styles.page, { width: PAGE_WIDTH * zoom, height: PAGE_HEIGHT * zoom }, Platform.OS === 'web' && { cursor: readOnly ? 'default' : activeTool === 'hand' ? 'grab' : activeTool === 'text' ? 'text' : canSelect ? 'default' : 'crosshair' }]}
      {...(canSelect && activeTool === 'select' ? backgroundHandlers : {})}
    >
      {showBackground ? <PageBackground page={page} zoom={zoom} underlay={guideUnderlay} /> : guideUnderlay}
      {/*
        그림 층: 페이지 썸네일과 같은 StaticPage 로 그린다. (썸네일이 이 화면을 그대로 비춘다) 터치는 받지 않는다.
        iPad 에서 터치용 View 안에 그리면 요소가 하나도 보이지 않는 문제가 있어 그리기와 터치를 나눴다.
      */}
      <View style={styles.clip} pointerEvents="none">
        <StaticPage page={drawingPage} zoom={zoom} cropId={cropId} background="transparent" showBackground={false} fadeIds={draggingIds} stillIds={interacting ? selectedIds : null} onTextMeasure={readOnly || interacting ? null : fitTextHeight} />
      </View>
      {readOnly && <TextLinkOverlay objects={page.objects} zoom={zoom} onError={onToast} />}
      {readOnly && <ObjectLinkOverlay objects={page.objects} zoom={zoom} onError={onToast} />}
      {!readOnly && linkBadges && <LinkBadges objects={page.objects} zoom={zoom} selectedIds={selectedIds} onSelect={(id) => dispatch({ type: 'select', ids: [id] })} />}
      {!readOnly && activeTool === 'lasso' && !textEditing && (
        <LassoInput key={[page.id, zoom, lassoShape, lassoMode].join('-')} objects={page.objects}
          selectedIds={selectedIds} shape={lassoShape} mode={lassoMode} zoom={zoom}
          pageWidth={PAGE_WIDTH} pageHeight={PAGE_HEIGHT} captureAll={!lassoEditing}
          onDrawingChange={setLassoDrawing}
          onClearSelection={() => { setLassoOutline(null); setLassoCapture(false); onLassoCommit([]) }}
          onCommit={(ids, result) => {
            setLassoOutline(result?.shape === 'freeform'
              ? createLassoOutline(lassoOutline, page.id, selectedIds, ids, page.objects, result.polygon, result.mode) : null)
            setLassoCapture(false)
            onLassoCommit(ids)
          }} />
      )}
      {/* 터치 층: 요소마다 같은 자리에 투명한 상자를 두고 선택·이동을 받는다. */}
      <View style={[styles.hitLayer, (activeTool === 'lasso' || textTool) && { zIndex: 1 }]} pointerEvents={canTouch ? 'box-none' : 'none'}>
        {visible.filter((object) => (textTool ? object.type === 'text' : object.type !== 'stroke' || selectedIds.includes(object.id))).map((object) => (
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
          />
        ))}
      </View>

      {/* 펜·형광펜·지우개: 손바닥은 거르고 펜(또는 첫 손가락) 하나만 따라 그린다 */}
      <PalmRejectionArea>
      {!readOnly && ['pen', 'highlighter'].includes(activeTool) && (
        <View style={styles.penClip}>
          {/* 확대·축소 중에 다시 만들지 않는다 (손가락 아래의 입력 영역이 바뀌면 웹에서 터치 끝이 전달되지 않는다) */}
          <PenInput key={`${page.id}-${activeTool}`} zoom={zoom} pageWidth={PAGE_WIDTH} pageHeight={PAGE_HEIGHT} dispatch={dispatch} straightAssist={straightAssist} settings={activeTool === 'highlighter' ? highlighterSettings : penSettings} />
        </View>
      )}
      {!readOnly && activeTool === 'eraser' && <View style={styles.penClip}>
        <EraserInput key={`${page.id}-${zoom}-${eraserSize}-${eraserMode}`} objects={page.objects} diameter={eraserSize} mode={eraserMode} zoom={zoom} dispatch={dispatch} onPreview={previewErase} />
      </View>}
      </PalmRejectionArea>
      {/* 창을 닫으려고 누른 터치는 여기서 삼키고 창만 닫는다. 펜·형광펜에 점이 찍히던 문제 */}
      {inputBlocker && ['pen', 'highlighter', 'eraser'].includes(activeTool) && (
        <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} {...inputBlocker} accessibilityElementsHidden />
      )}
      {!readOnly && activeTool === 'text' && !textEditing && <TextBoxInput key={`${page.id}-${zoom}`} zoom={zoom} pageWidth={PAGE_WIDTH} pageHeight={PAGE_HEIGHT} onCreate={onCreateText} />}
      {!readOnly && textEditing && <TextEditor onToast={onToast} onPaletteChange={onTextPaletteChange} paletteBounds={textPaletteBounds} boundary={textBoundary} key={textEditing.id} object={textEditing} zoom={zoom} onSave={onSaveText} onCancel={onCancelText} onReveal={onRevealText} />}

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
      {emptyMenu?.panel === 'paper' && canSelect && (
        <PaperColorSettings
          appearance={paperAppearance}
          onChange={(appearance, all) => onPaperAppearance?.(appearance, all)}
          onClose={() => setEmptyMenu(null)}
          style={paperBubblePosition(emptyMenu, zoom, PAGE_WIDTH, PAGE_HEIGHT)}
        />
      )}
      {emptyMenu && !emptyMenu.panel && canSelect && (
        <EmptyMenu
          at={emptyMenu}
          zoom={zoom}
          pageWidth={PAGE_WIDTH}
          canPaste={canPaste}
          onPaste={() => { setEmptyMenu(null); onPaste?.(emptyMenu) }}
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
        <View pointerEvents="box-none" style={styles.selectionMenu}>
        <ContextBar
          onCopyText={onCopyText}
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
          onToast={onToast}
          insideHandlers={contextBarInside}
        />
        </View>
      )}
    </View>
  )
}

/** 빈 곳 길게 누르기 메뉴. 요소 편집 바와 같은 모양으로 누른 자리 위에 띄운다 */
// 속지 색 말풍선: 누른 자리 아래(아래가 좁으면 위)에, 페이지 밖으로 나가지 않게
const PAPER_BUBBLE = { width: 300, height: 290 }
function paperBubblePosition(at, zoom, pageWidth, pageHeight) {
  const x = at.x * zoom, y = at.y * zoom, w = pageWidth * zoom, h = pageHeight * zoom
  const left = clamp(x - PAPER_BUBBLE.width / 2, 8, Math.max(8, w - PAPER_BUBBLE.width - 8))
  const below = y + 16 + PAPER_BUBBLE.height <= h
  return { position: 'absolute', zIndex: 6, width: PAPER_BUBBLE.width, left, top: below ? y + 16 : Math.max(8, y - 16 - PAPER_BUBBLE.height) }
}

function EmptyMenu({ at, zoom, pageWidth, canPaste, onPaste, onPaperColor }) {
  const width = 210
  const left = clamp(at.x * zoom - width / 2, 8, Math.max(8, pageWidth * zoom - width - 8))
  const top = Math.max(8, at.y * zoom - 64)
  return (
    <View style={[styles.emptyMenu, { left, top, width }]} accessibilityLabel="빈 곳 메뉴">
      <MenuButton icon="clipboard" label="붙여넣기" disabled={!canPaste} onPress={onPaste} />
      <MenuButton icon="roller" label="속지 색" onPress={onPaperColor} />
    </View>
  )
}

function MenuButton({ icon, label, disabled, onPress }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [styles.menuButton, pressed && styles.menuPressed, disabled && styles.menuDisabled]}>
      <Icon name={icon} size={17} color={colors.text} />
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
const DOUBLE_TAP_MS = 350
const lastTextTap = { id: null, time: 0 }
/** 이 텍스트를 방금 전에도 눌렀으면 true (더블 탭) */
function isDoubleTap(id) {
  const now = Date.now()
  const double = lastTextTap.id === id && now - lastTextTap.time < DOUBLE_TAP_MS
  lastTextTap.id = double ? null : id
  lastTextTap.time = now
  return double
}

function CanvasObject({ object, objects, pageWidth: PAGE_WIDTH, pageHeight: PAGE_HEIGHT, zoom, selectedIds, cropping, isCropTarget, dispatch, onGuides, onInteracting, onDragging, onEditText }) {
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
      // 움직이지 않고 길게 누르면 누르기 전 선택에 이 요소를 넣거나 뺀다.
      if (g?.mode === 'move' && !moved && duration >= LONG_PRESS_MS) {
        dispatch({ type: 'select', ids: g.previousSelection })
        dispatch({ type: 'toggleSelect', id: object.id })
        return
      }
      // 이미 선택된 그룹을 한 번 더 탭하면 그 요소만 골라 따로 고칠 수 있다. (빈 곳을 누르면 다시 그룹 단위)
      if (g?.mode === 'move' && !moved && g.groupSelected) {
        dispatch({ type: 'selectExact', ids: [object.id] })
        return
      }
      // 텍스트 더블 탭은 겹친 요소가 있어도 바로 수정한다.
      if (g?.mode === 'move' && !moved && object.type === 'text' && !object.locked && isDoubleTap(object.id)) {
        onEditText(object)
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
  page: {
    // 웹 터치: 페이지 위 드래그를 브라우저가 스크롤·뒤로 가기 스와이프로 가져가지 않게 한다. (영역 선택·이동용)
    ...Platform.select({ web: { touchAction: 'none' }, default: {} }),
    backgroundColor: colors.surface,
    // 테두리 선은 두지 않는다: 태블릿에서 종이 위쪽에 회색 띠처럼 보였다. 종이와 바탕은 그림자로 구분한다.
    shadowColor: '#0B1957',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  clip: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
  },
  hitLayer: { ...StyleSheet.absoluteFillObject },
  emptyMenu: { position: 'absolute', zIndex: 6, flexDirection: 'row', justifyContent: 'space-between', padding: 4, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(110,146,198,0.2)', boxShadow: '0px 6px 14px rgba(11, 25, 87, 0.16)' },
  menuButton: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 42, paddingHorizontal: 10, borderRadius: 11 },
  menuPressed: { backgroundColor: colors.primarySoft },
  menuDisabled: { opacity: 0.35 },
  menuText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  selectionControls: { ...StyleSheet.absoluteFillObject, zIndex: 2 },
  selectionMenu: { ...StyleSheet.absoluteFillObject, zIndex: 4 },
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
    backgroundColor: 'rgba(110,146,198,0.12)',
  },
  groupFrame: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: 12,
  },
  groupFrameInside: { borderWidth: 1.5, borderColor: 'rgba(110,146,198,0.55)' },
  groupLabel: {
    position: 'absolute',
    top: -26,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.primary,
    color: colors.surface,
    fontSize: 11,
    fontWeight: '800',
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
  angleText: { color: colors.surface, fontSize: 13, fontWeight: '800' },
})
