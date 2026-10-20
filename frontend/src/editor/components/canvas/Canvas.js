import { useRef, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { PAGE_HEIGHT, PAGE_WIDTH, PHOTO_SHAPES } from '../../constants'
import { usePan } from '../../hooks/usePan'
import { expandGroups } from '../../state/editorReducer'
import { centerOf, clamp, rotateVector, unionBounds } from '../../utils/common'
import { isMultiSelectKey } from '../../utils/modifiers'
import { coverLayout, photoInnerBox } from '../../utils/objects'
import ContextBar from './ContextBar'
import CropHandles from './CropHandles'
import ObjectContent, { objectOpacity } from './ObjectView'
import SelectionOverlay from './SelectionOverlay'
import PenInput from '../PenInput'

const SNAP_SCREEN_PX = 6
const LONG_PRESS_MS = 450
const MARQUEE_MIN_PX = 6

/**
 * 편집 캔버스. 논리 좌표(PAGE_WIDTH × PAGE_HEIGHT)에 zoom 을 곱해 그린다.
 * - 탭: 선택 (묶음이면 묶음 전체)
 * - 길게 누르기 / Shift·Ctrl+클릭: 다중 선택에 추가/제외
 * - 드래그: 선택된 요소 함께 이동 (페이지 가운데·다른 요소 중심선에 스냅)
 * - 빈 곳 드래그: 점선 네모(영역 선택) 안에 완전히 들어간 요소를 선택. Shift·Ctrl 을 누르고 있으면 기존 선택에 더한다.
 * - 자르기 중인 사진은 드래그하면 보이는 영역이 움직인다.
 */
export default function Canvas({
  page,
  zoom,
  selectedIds,
  cropId,
  dispatch,
  moreOpen,
  onToggleMore,
  onCrop,
  onReplacePhoto,
  onToast,
  activeTool = 'select',
  readOnly = false,
}) {
  const canSelect = !readOnly && activeTool === 'select'
  const [guides, setGuides] = useState(null)
  const [rotationLabel, setRotationLabel] = useState(null)
  const [interacting, setInteracting] = useState(false)
  const visible = page.objects.filter((o) => !o.hidden)
  const selected = visible.filter((o) => selectedIds.includes(o.id))
  const cropping = Boolean(cropId)
  // 사각·라운드 사진은 PPT 처럼 테두리 손잡이로 자유롭게 자른다.
  const freeCropTarget = visible.find(
    (o) => o.id === cropId && o.frame === 'shape' && !PHOTO_SHAPES.find((s) => s.id === o.shape)?.square,
  )

  const [marquee, setMarquee] = useState(null) // 논리 좌표 { left, top, right, bottom }
  const marqueeRef = useRef(null)
  const backgroundHandlers = usePan({
    onStart: (event) => {
      if (!canSelect) return
      marqueeRef.current = {
        x: event.locationX / zoom,
        y: event.locationY / zoom,
        base: isMultiSelectKey() ? selectedIds : [],
        key: '',
      }
    },
    onMove: (dx, dy) => {
      const m = marqueeRef.current
      if (!m || cropping || Math.hypot(dx, dy) < MARQUEE_MIN_PX) return
      const rect = {
        left: Math.min(m.x, m.x + dx / zoom),
        right: Math.max(m.x, m.x + dx / zoom),
        top: Math.min(m.y, m.y + dy / zoom),
        bottom: Math.max(m.y, m.y + dy / zoom),
      }
      setMarquee(rect)
      // 점선 네모 안에 완전히 들어간 요소만 고른다. 그룹은 구성 요소가 모두 들어갔을 때만 통째로 고른다.
      // (예전에는 회전 전 외곽 상자가 조금만 걸쳐도, 또 그룹 하나만 걸쳐도 그룹 전체가 선택됐다)
      const inside = new Set(visible.filter((o) => cornersOf(o).every((p) => contains(rect, p))).map((o) => o.id))
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
    onEnd: ({ moved }) => {
      marqueeRef.current = null
      setMarquee(null)
      if (!moved && !cropping) dispatch({ type: 'select', ids: [] })
    },
  })

  return (
    <View
      accessibilityLabel={readOnly ? '다이어리 읽기 캔버스' : `${{ select: '선택', pen: '펜', highlighter: '형광펜', text: '텍스트' }[activeTool]} 캔버스`}
      style={[styles.page, { width: PAGE_WIDTH * zoom, height: PAGE_HEIGHT * zoom }, Platform.OS === 'web' && { cursor: readOnly ? 'default' : activeTool === 'text' ? 'text' : canSelect ? 'default' : 'crosshair' }]}
      {...(canSelect ? backgroundHandlers : {})}
    >
      <View style={styles.clip} pointerEvents={canSelect ? 'box-none' : 'none'}>
        {visible.map((object) => (
          <CanvasObject
            key={object.id}
            object={object}
            objects={page.objects}
            zoom={zoom}
            selectedIds={selectedIds}
            cropping={cropping}
            isCropTarget={object.id === cropId}
            dispatch={dispatch}
            onGuides={setGuides}
            onInteracting={setInteracting}
          />
        ))}
      </View>

      {!readOnly && activeTool === 'pen' && (
        <View style={styles.penClip}>
          <PenInput key={`${page.id}-${zoom}`} zoom={zoom} dispatch={dispatch} />
        </View>
      )}

      {freeCropTarget && <CropHandles photo={freeCropTarget} zoom={zoom} dispatch={dispatch} />}

      {guides?.x != null && <View style={[styles.guideV, { left: guides.x * zoom }]} pointerEvents="none" />}
      {guides?.y != null && <View style={[styles.guideH, { top: guides.y * zoom }]} pointerEvents="none" />}

      {canSelect && selected.length === 1 && !cropping && !marquee && (
        <SelectionOverlay
          object={selected[0]}
          zoom={zoom}
          dispatch={dispatch}
          onRotation={setRotationLabel}
          onInteracting={setInteracting}
        />
      )}
      {selected.length > 1 && !marquee && <GroupFrame objects={selected} zoom={zoom} />}
      {selected.length === 1 && selected[0].groupId && !cropping && !marquee && (
        <GroupFrame objects={visible.filter((o) => o.groupId === selected[0].groupId)} zoom={zoom} inside />
      )}
      {/* 영역 선택 중: 지금 네모 안에 들어와 선택될 요소마다 테두리와 옅은 칠을 보여 준다. */}
      {marquee && selected.map((object) => <HitOutline key={object.id} object={object} zoom={zoom} />)}
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

      {canSelect && selected.length > 0 && !cropping && !interacting && !marquee && (
        <ContextBar
          key={selectedIds.join(',')}
          objects={selected}
          allObjects={page.objects}
          zoom={zoom}
          dispatch={dispatch}
          moreOpen={moreOpen}
          onToggleMore={onToggleMore}
          onCrop={onCrop}
          onReplacePhoto={onReplacePhoto}
          onToast={onToast}
        />
      )}
    </View>
  )
}

function HitOutline({ object, zoom }) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.hit,
        {
          left: object.x * zoom - 3,
          top: object.y * zoom - 3,
          width: object.w * zoom + 6,
          height: object.h * zoom + 6,
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

function CanvasObject({ object, objects, zoom, selectedIds, cropping, isCropTarget, dispatch, onGuides, onInteracting }) {
  const gesture = useRef(null)

  const panHandlers = usePan({
    disabled: cropping && !isCropTarget,
    onStart: () => {
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
      const wasSelected = selectedIds.includes(object.id)
      const ids = wasSelected ? selectedIds : insideGroup ? [object.id] : expandGroups(objects, [object.id])
      const moving = objects.filter((o) => ids.includes(o.id) && !o.locked)
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
      dispatch({ type: 'updateMany', patches })
    },
    onEnd: ({ moved, duration }) => {
      const g = gesture.current
      gesture.current = null
      onGuides(null)
      onInteracting(false)
      // 움직이지 않고 길게 누르면 누르기 전 선택에 이 요소를 넣거나 뺀다.
      if (g?.mode === 'move' && !moved && duration >= LONG_PRESS_MS) {
        dispatch({ type: 'select', ids: g.previousSelection })
        dispatch({ type: 'toggleSelect', id: object.id })
        return
      }
      // 이미 선택된 그룹을 한 번 더 탭하면 그 요소만 골라 따로 고칠 수 있다. (빈 곳을 누르면 다시 그룹 단위)
      if (g?.mode === 'move' && !moved && g.groupSelected) dispatch({ type: 'selectExact', ids: [object.id] })
    },
  })

  return (
    <View
      {...panHandlers}
      style={{
        position: 'absolute',
        left: object.x * zoom,
        top: object.y * zoom,
        width: object.w * zoom,
        height: object.h * zoom,
        transform: [{ rotate: `${object.rotation}deg` }],
        opacity: objectOpacity(object) * (cropping && !isCropTarget ? 0.45 : 1),
      }}
    >
      <ObjectContent object={object} zoom={zoom} />
      {isCropTarget && <View style={styles.cropRing} pointerEvents="none" />}
    </View>
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
    borderWidth: 1,
    borderColor: 'rgba(11,25,87,0.08)',
    shadowColor: '#0B1957',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  clip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
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
  hit: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 4,
    backgroundColor: 'rgba(110,146,198,0.14)',
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
  cropRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: colors.primary,
    margin: -6,
    borderRadius: 6,
  },
})
