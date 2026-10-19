import { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../../theme'
import { PAGE_HEIGHT, PAGE_WIDTH } from '../constants'
import { usePan } from '../hooks/usePan'
import { expandGroups } from '../state/editorReducer'
import { centerOf, clamp, rotateVector, unionBounds } from '../utils/common'
import { coverLayout, photoInnerBox } from '../utils/objects'
import ContextBar from './ContextBar'
import ObjectContent from './ObjectView'
import SelectionOverlay from './SelectionOverlay'

const SNAP_SCREEN_PX = 6
const LONG_PRESS_MS = 450

/**
 * 편집 캔버스. 논리 좌표(PAGE_WIDTH × PAGE_HEIGHT)에 zoom 을 곱해 그린다.
 * - 탭: 선택 (묶음이면 묶음 전체)
 * - 길게 누르기: 다중 선택에 추가/제외
 * - 드래그: 선택된 요소 함께 이동 (페이지 가운데·다른 요소 중심선에 스냅)
 * - 자르기 중인 사진은 드래그하면 보이는 영역이 움직인다.
 */
export default function Canvas({ page, zoom, selectedIds, cropId, dispatch, onCrop, onToast }) {
  const [guides, setGuides] = useState(null)
  const [rotationLabel, setRotationLabel] = useState(null)
  const [interacting, setInteracting] = useState(false)
  const visible = page.objects.filter((o) => !o.hidden)
  const selected = visible.filter((o) => selectedIds.includes(o.id))
  const cropping = Boolean(cropId)

  const backgroundResponder = {
    onStartShouldSetResponder: () => true,
    onResponderRelease: () => {
      if (!cropping) dispatch({ type: 'select', ids: [] })
    },
  }

  return (
    <View style={[styles.page, { width: PAGE_WIDTH * zoom, height: PAGE_HEIGHT * zoom }]} {...backgroundResponder}>
      <View style={styles.clip} pointerEvents="box-none">
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

      {guides?.x != null && <View style={[styles.guideV, { left: guides.x * zoom }]} pointerEvents="none" />}
      {guides?.y != null && <View style={[styles.guideH, { top: guides.y * zoom }]} pointerEvents="none" />}

      {selected.length === 1 && !cropping && (
        <SelectionOverlay
          object={selected[0]}
          zoom={zoom}
          dispatch={dispatch}
          onRotation={setRotationLabel}
          onInteracting={setInteracting}
        />
      )}
      {selected.length > 1 && <GroupFrame objects={selected} zoom={zoom} />}

      {rotationLabel != null && selected.length === 1 && (
        <View
          style={[styles.angleBadge, { left: centerOf(selected[0]).x * zoom - 34, top: centerOf(selected[0]).y * zoom - 16 }]}
          pointerEvents="none"
        >
          <Text style={styles.angleText}>{Math.round(rotationLabel)}°</Text>
        </View>
      )}

      {selected.length > 0 && !cropping && !interacting && (
        <ContextBar objects={selected} zoom={zoom} dispatch={dispatch} onCrop={onCrop} onToast={onToast} />
      )}
    </View>
  )
}

function GroupFrame({ objects, zoom }) {
  const bounds = unionBounds(objects)
  const pad = 8
  return (
    <View
      pointerEvents="none"
      style={[
        styles.groupFrame,
        {
          left: bounds.left * zoom - pad,
          top: bounds.top * zoom - pad,
          width: (bounds.right - bounds.left) * zoom + pad * 2,
          height: (bounds.bottom - bounds.top) * zoom + pad * 2,
        },
      ]}
    >
      <Text style={styles.groupLabel}>{objects.length}개 선택</Text>
    </View>
  )
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
      const ids = selectedIds.includes(object.id) ? selectedIds : expandGroups(objects, [object.id])
      const moving = objects.filter((o) => ids.includes(o.id) && !o.locked)
      gesture.current = {
        mode: 'move',
        wasSelected: selectedIds.includes(object.id),
        previousSelection: selectedIds,
        starts: Object.fromEntries(moving.map((o) => [o.id, { x: o.x, y: o.y }])),
        bounds: moving.length ? unionBounds(moving) : null,
        others: objects.filter((o) => !ids.includes(o.id) && !o.hidden),
        checkpointed: false,
      }
      if (!gesture.current.wasSelected) dispatch({ type: 'select', ids: [object.id] })
    },
    onMove: (dx, dy) => {
      const g = gesture.current
      if (!g) return
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
      }
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
        opacity: cropping && !isCropTarget ? 0.45 : 1,
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
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(11,25,87,0.08)',
    shadowColor: '#0B1957',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  clip: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', borderRadius: 16 },
  guideV: { position: 'absolute', top: 0, bottom: 0, width: 0, borderLeftWidth: 1, borderColor: colors.primary, borderStyle: 'dashed' },
  guideH: { position: 'absolute', left: 0, right: 0, height: 0, borderTopWidth: 1, borderColor: colors.primary, borderStyle: 'dashed' },
  groupFrame: { position: 'absolute', borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: 12 },
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
    position: 'absolute',
    width: 68,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text,
  },
  angleText: { color: colors.surface, fontSize: 13, fontWeight: '800' },
  cropRing: { ...StyleSheet.absoluteFillObject, borderWidth: 3, borderColor: colors.primary, margin: -6, borderRadius: 6 },
})
