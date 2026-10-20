import { useRef } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { usePan } from '../../hooks/usePan'
import { centerOf, normalizeAngle, rotateVector } from '../../utils/common'

// 핸들이 박스 바깥에 걸쳐도 터치를 받도록 오버레이를 이만큼 넓게 잡는다. (Android 는 부모 밖 터치를 받지 않음)
const MARGIN = 52
const HANDLE = 18
const EDGE_THICKNESS = 20 // 변 전체가 보이지 않는 크기 조절 영역
// 변 영역은 대부분 박스 바깥에 두고 안쪽으로는 이만큼만 들어온다. (가운데를 눌러 옮기는 영역을 넓게 남긴다)
const EDGE_INSET = 4
const ROTATE_OFFSET = 34
const MIN_SIZE = 20

const CORNERS = [
  { key: 'nw', sx: -1, sy: -1 },
  { key: 'ne', sx: 1, sy: -1 },
  { key: 'sw', sx: -1, sy: 1 },
  { key: 'se', sx: 1, sy: 1 },
]
const SIDES = [
  { key: 'n', sx: 0, sy: -1 },
  { key: 's', sx: 0, sy: 1 },
  { key: 'w', sx: -1, sy: 0 },
  { key: 'e', sx: 1, sy: 0 },
]

const LENGTH_KNOBS = [
  { key: 'w', sx: -1, sy: 0, knob: true },
  { key: 'e', sx: 1, sy: 0, knob: true },
]
const KNOB = HANDLE // 회전 손잡이와 같은 크기

/** 오브젝트 종류별로 쓸 수 있는 크기 조절 핸들 */
function handlesFor(object) {
  if (object.type === 'sticker') return CORNERS
  // 테이프: 폭은 규격으로 정해져 있고 길이만 늘이고 줄인다. 양쪽 끝 동그라미 손잡이 두 개.
  if (object.type === 'tape') return LENGTH_KNOBS
  if (object.type === 'photo' && object.frame === 'polaroid') return CORNERS // 폴라로이드 비율은 자르기에서 정한다.
  return [...CORNERS, ...SIDES]
}

/** 회전을 반영한 양방향 리사이즈 커서 (웹) */
const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize']
function cursorFor(handle, rotation) {
  const angle = normalizeAngle((Math.atan2(handle.sy, handle.sx) * 180) / Math.PI + rotation) % 180
  return CURSORS[Math.round(angle / 45) % 4]
}

/** 선택된 오브젝트 하나의 테두리 + 크기·회전 핸들 */
export default function SelectionOverlay({ object, zoom, dispatch, onRotation, onInteracting }) {
  const width = object.w * zoom
  const height = object.h * zoom
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: object.x * zoom - MARGIN,
        top: object.y * zoom - MARGIN,
        width: width + MARGIN * 2,
        height: height + MARGIN * 2,
        transform: [{ rotate: `${object.rotation}deg` }],
      }}
    >
      <View
        pointerEvents="none"
        style={[styles.frame, object.locked && styles.frameLocked, { left: MARGIN, top: MARGIN, width, height }]}
      />
      {!object.locked && (
        <>
          <View
            pointerEvents="none"
            style={[styles.rotateStem, { left: MARGIN + width / 2 - 0.75, top: MARGIN - ROTATE_OFFSET }]}
          />
          <Handle
            kind="rotate"
            object={object}
            zoom={zoom}
            dispatch={dispatch}
            onRotation={onRotation}
            onInteracting={onInteracting}
            style={[
              styles.handleBase,
              styles.rotateHandle,
              { left: MARGIN + width / 2 - HANDLE / 2, top: MARGIN - ROTATE_OFFSET - HANDLE / 2 },
            ]}
          />
          {handlesFor(object).map((handle) => {
            const corner = Boolean(handle.sx && handle.sy)
            // 테이프 길이 손잡이: 변 가운데에 보이는 동그라미
            if (handle.knob) {
              return (
                <Handle
                  key={handle.key}
                  kind="resize"
                  handle={handle}
                  object={object}
                  zoom={zoom}
                  dispatch={dispatch}
                  onInteracting={onInteracting}
                  style={[
                    styles.handleBase,
                    styles.knob,
                    {
                      left: MARGIN + ((handle.sx + 1) / 2) * width - KNOB / 2,
                      top: MARGIN + height / 2 - KNOB / 2,
                    },
                    Platform.OS === 'web' && { cursor: cursorFor(handle, object.rotation) },
                  ]}
                />
              )
            }
            // 변 핸들은 눈에 보이지 않게 변을 따라 깔고, 꼭짓점 핸들 자리는 비워 둔다.
            const edgeLength = Math.max((handle.sx ? height : width) - HANDLE * 2, 12)
            const size = corner
              ? { width: HANDLE, height: HANDLE }
              : handle.sx
                ? { width: EDGE_THICKNESS, height: edgeLength }
                : { width: edgeLength, height: EDGE_THICKNESS }
            return (
              <Handle
                key={handle.key}
                kind="resize"
                handle={handle}
                object={object}
                zoom={zoom}
                dispatch={dispatch}
                onInteracting={onInteracting}
                style={[
                  corner ? [styles.handleBase, styles.cornerHandle] : styles.edgeHandle,
                  {
                    ...size,
                    left:
                      MARGIN +
                      ((handle.sx + 1) / 2) * width -
                      size.width / 2 +
                      (corner ? 0 : handle.sx * (EDGE_THICKNESS / 2 - EDGE_INSET)),
                    top:
                      MARGIN +
                      ((handle.sy + 1) / 2) * height -
                      size.height / 2 +
                      (corner ? 0 : handle.sy * (EDGE_THICKNESS / 2 - EDGE_INSET)),
                  },
                  Platform.OS === 'web' && { cursor: cursorFor(handle, object.rotation) },
                ]}
              />
            )
          })}
        </>
      )}
    </View>
  )
}

function Handle({ kind, handle, object, zoom, dispatch, onRotation, onInteracting, style }) {
  const gesture = useRef(null)

  const panHandlers = usePan({
    onStart: () => {
      const center = centerOf(object)
      // 손가락이 처음 닿은 위치 = 핸들 위치 (논리 좌표). 이후 위치는 이동량으로 계산한다.
      const local =
        kind === 'rotate'
          ? { x: 0, y: -object.h / 2 - ROTATE_OFFSET / zoom }
          : { x: (handle.sx * object.w) / 2, y: (handle.sy * object.h) / 2 }
      const offset = rotateVector(local.x, local.y, object.rotation)
      gesture.current = {
        start: object,
        center,
        pointer: { x: center.x + offset.x, y: center.y + offset.y },
        checkpointed: false,
      }
      onInteracting(true)
    },
    onMove: (dx, dy) => {
      const g = gesture.current
      if (!g) return
      if (!g.checkpointed) {
        dispatch({ type: 'checkpoint' })
        g.checkpointed = true
      }
      const pointer = { x: g.pointer.x + dx / zoom, y: g.pointer.y + dy / zoom }
      const patch = kind === 'rotate' ? rotatePatch(g, pointer) : resizePatch(g, handle, pointer)
      if (kind === 'rotate') onRotation(patch.rotation)
      dispatch({ type: 'updateObject', id: object.id, patch })
    },
    onEnd: () => {
      gesture.current = null
      onRotation?.(null)
      onInteracting(false)
    },
  })

  return <View {...panHandlers} hitSlop={10} style={[styles.handle, style]} />
}

/** 수평 기준 0–360°. 0·90·180·270° 근처(±3°)에서는 붙는다. */
function rotatePatch(g, pointer) {
  const raw = (Math.atan2(pointer.y - g.center.y, pointer.x - g.center.x) * 180) / Math.PI + 90
  const snapped = Math.round(raw / 90) * 90
  const angle = Math.abs(snapped - raw) <= 3 ? snapped : raw
  return { rotation: normalizeAngle(angle) }
}

/**
 * 반대편 모서리(변)를 고정하고 크기를 바꾼다.
 * - 모서리: 비율 유지
 * - 변: 해당 축만
 */
function resizePatch(g, handle, pointer) {
  const { start, center } = g
  const { sx, sy } = handle
  const q = rotateVector(pointer.x - center.x, pointer.y - center.y, -start.rotation)
  const anchor = { x: (-sx * start.w) / 2, y: (-sy * start.h) / 2 }
  let w = start.w
  let h = start.h

  if (sx && sy) {
    const diagonal = { x: sx * start.w, y: sy * start.h }
    const projected = ((q.x - anchor.x) * diagonal.x + (q.y - anchor.y) * diagonal.y) / (diagonal.x ** 2 + diagonal.y ** 2)
    const scale = Math.max(MIN_SIZE / Math.min(start.w, start.h), projected)
    w = start.w * scale
    h = start.h * scale
  } else if (sx) {
    w = Math.max(MIN_SIZE, sx * (q.x - anchor.x))
  } else {
    h = Math.max(MIN_SIZE, sy * (q.y - anchor.y))
  }

  const localCenter = { x: sx ? anchor.x + (sx * w) / 2 : 0, y: sy ? anchor.y + (sy * h) / 2 : 0 }
  const offset = rotateVector(localCenter.x, localCenter.y, start.rotation)
  return { w, h, x: center.x + offset.x - w / 2, y: center.y + offset.y - h / 2 }
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', borderWidth: 1.5, borderColor: colors.primary },
  frameLocked: { borderStyle: 'dashed', borderColor: colors.textMuted },
  handle: { position: 'absolute' },
  handleBase: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    shadowColor: '#0B1957',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2 },
  cornerHandle: { borderRadius: HANDLE / 2 },
  edgeHandle: { backgroundColor: 'transparent' },
  rotateHandle: {
    width: HANDLE,
    height: HANDLE,
    borderRadius: HANDLE / 2,
    backgroundColor: colors.primary,
    borderColor: colors.surface,
  },
  rotateStem: { position: 'absolute', width: 1.5, height: ROTATE_OFFSET, backgroundColor: colors.primary },
})
