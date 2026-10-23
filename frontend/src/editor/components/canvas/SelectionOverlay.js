import { useRef } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { usePan } from '../../hooks/usePan'
import { centerOf, normalizeAngle, rotateVector } from '../../utils/common'
import { textFormatPatch, textSettings, TEXT_FRAME_PAD } from '../../utils/text'
import { ROTATE_HANDLE as ROTATE_HANDLE_SIZE, ROTATE_OFFSET } from '../../utils/popoverPlacement'
import Icon from '../controls/Icon'

// 핸들이 박스 바깥에 걸쳐도 터치를 받도록 오버레이를 이만큼 넓게 잡는다. (Android 는 부모 밖 터치를 받지 않음)
const MARGIN = 52
const FRAME_WIDTH = 1.5 // 선택 테두리 굵기
const HANDLE = 18
const EDGE_THICKNESS = 20 // 변 전체가 보이지 않는 크기 조절 영역
// 변 영역은 대부분 박스 바깥에 두고 안쪽으로는 이만큼만 들어온다. (가운데를 눌러 옮기는 영역을 넓게 남긴다)
const EDGE_INSET = 4
const ROTATE_HANDLE = ROTATE_HANDLE_SIZE // 꼭짓점 손잡이와 같은 크기 (떠 있는 메뉴가 이 자리를 피한다)
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
  // 사진: 비율은 '자르기'에서 정하고, 캔버스에서는 모서리로 크기만 바꾼다 (변을 끌어 비율이 바뀌지 않게)
  if (object.type === 'photo') return CORNERS
  // 텍스트: 좌우는 줄바꿈 폭, 상하는 내용보다 작아지지 않는 상자 높이를 조절한다.
  if (object.type === 'text') return SIDES
  return [...CORNERS, ...SIDES]
}

/** 회전을 반영한 양방향 리사이즈 커서 (웹) */
const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize']
function cursorFor(handle, rotation) {
  const angle = normalizeAngle((Math.atan2(handle.sy, handle.sx) * 180) / Math.PI + rotation) % 180
  return CURSORS[Math.round(angle / 45) % 4]
}

/** 선택된 오브젝트 하나의 테두리 + 크기·회전 핸들 */
export default function SelectionOverlay({ object, zoom, dispatch, onRotation, onInteracting, textMinHeight = null }) {
  // 보이는 상자: 텍스트는 편집 중 테두리와 같이 글자에서 TEXT_FRAME_PAD 만큼 띄운다. (크기 계산은 요소 상자 그대로)
  const pad = object.type === 'text' ? TEXT_FRAME_PAD : 0
  const width = object.w * zoom + pad * 2
  const height = object.h * zoom + pad * 2
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: object.x * zoom - pad - MARGIN,
        top: object.y * zoom - pad - MARGIN,
        width: width + MARGIN * 2,
        height: height + MARGIN * 2,
        transform: [{ rotate: `${object.rotation}deg` }],
      }}
    >
      <View
        pointerEvents="none"
        // 테두리는 요소 바깥에 그린다. 안쪽에 그리면 기기에서 픽셀을 반올림할 때 사진 가장자리가 선 밖으로 살짝 튀어나와 보였다.
        style={[styles.frame, object.locked && styles.frameLocked, { left: MARGIN - FRAME_WIDTH, top: MARGIN - FRAME_WIDTH, width: width + FRAME_WIDTH * 2, height: height + FRAME_WIDTH * 2 }]}
      />
      {!object.locked && (
        <>
          <View
            pointerEvents="none"
            style={[styles.rotateStem, { left: MARGIN + width / 2 - FRAME_WIDTH / 2, top: MARGIN - ROTATE_OFFSET }]}
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
              { left: MARGIN + width / 2 - ROTATE_HANDLE / 2, top: MARGIN - ROTATE_OFFSET - ROTATE_HANDLE / 2 },
              Platform.OS === 'web' && { cursor: 'grab' },
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
                  textMinHeight={textMinHeight}
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
                textMinHeight={textMinHeight}
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

function Handle({ kind, handle, object, zoom, dispatch, onRotation, onInteracting, style, textMinHeight = null }) {
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
        textMinHeight: Number.isFinite(textMinHeight) && textMinHeight > 0 ? textMinHeight : null,
        center,
        zoom,
        pointer: { x: center.x + offset.x, y: center.y + offset.y },
        checkpointed: false,
      }
      onInteracting(true)
      if (kind === 'rotate') onRotation(object.rotation)
    },
    onMove: (dx, dy) => {
      const g = gesture.current
      if (!g) return
      const pointer = { x: g.pointer.x + dx / g.zoom, y: g.pointer.y + dy / g.zoom }
      const patch = kind === 'rotate' ? rotatePatch(g, pointer) : resizePatch(g, handle, pointer)
      // 단순 탭이나 최소 크기에서 더 줄이는 입력은 빈 실행 취소 단계를 만들지 않는다.
      if (!g.checkpointed && Object.entries(patch).every(([key, value]) => Math.abs(value - g.start[key]) < 1e-8)) return
      if (!g.checkpointed) {
        dispatch({ type: 'checkpoint' })
        g.checkpointed = true
      }
      if (kind === 'rotate') onRotation(patch.rotation)
      dispatch({ type: 'updateObject', id: object.id, patch })
    },
    onEnd: ({ cancelled }) => {
      const g = gesture.current
      gesture.current = null
      if (cancelled && g?.checkpointed) dispatch({ type: 'revertToCheckpoint' })
      onRotation?.(null)
      onInteracting(false)
    },
  })

  return <View {...panHandlers} accessibilityLabel={kind === 'rotate' ? '요소 회전 손잡이' : object.type === 'text' ? handle.sy ? `텍스트 높이 조절 ${handle.sy < 0 ? '위쪽' : '아래쪽'}` : `텍스트 너비 조절 ${handle.sx < 0 ? '왼쪽' : '오른쪽'}` : undefined} hitSlop={10} style={[styles.handle, style]}>
    {kind === 'rotate' && <View pointerEvents="none"><Icon name="rotate" size={11} strokeWidth={2.6} color={colors.surface} /></View>}
    {kind === 'resize' && object.type === 'text' && <View pointerEvents="none" style={[styles.sideGrip, handle?.sy && { width: 24, height: 8 }]} />}
  </View>
}

// 0·90·180·270° 에서 한 번씩 걸리는 범위 (PPT 처럼). 5° 떨어진 각도(355° 등)는 그대로 둘 수 있어야 해서 5° 보다 작게.
const ROTATE_SNAP_DEG = 4.5

/** 수평 기준 0–360°. 0·90·180·270° 근처(±ROTATE_SNAP_DEG)에서는 붙는다. */
function rotatePatch(g, pointer) {
  const raw = (Math.atan2(pointer.y - g.center.y, pointer.x - g.center.x) * 180) / Math.PI + 90
  const snapped = Math.round(raw / 90) * 90
  const angle = Math.abs(snapped - raw) <= ROTATE_SNAP_DEG ? snapped : raw
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
    // 실측 전에는 현재 높이를 더 줄이지 않아 글꼴별 폭 추정 오차로 인한 잘림을 막는다.
    const contentHeight = start.type === 'text' ? g.textMinHeight ?? Math.max(start.h, textFormatPatch(start, textSettings(start)).h) : 0
    h = Math.max(MIN_SIZE, contentHeight, sy * (q.y - anchor.y))
  }

  let baseWidth
  const reflowText = start.type === 'text' && sx && !sy
  if (reflowText) {
    if (Math.abs(w - start.w) < 1e-8) return { x: start.x, y: start.y, w: start.w, h: start.h, baseWidth: start.baseWidth ?? start.w }
    const scale = start.w / (start.baseWidth ?? start.w)
    baseWidth = w / scale
    h = textFormatPatch({ ...start, w, baseWidth }, textSettings(start)).h
  }
  const localCenter = {
    x: sx ? anchor.x + (sx * w) / 2 : 0,
    // 텍스트 폭 조절은 윗줄을 고정하고 아래로 줄바꿈한다.
    y: reflowText ? (h - start.h) / 2 : sy ? anchor.y + (sy * h) / 2 : 0,
  }
  const offset = rotateVector(localCenter.x, localCenter.y, start.rotation)
  return { w, h, x: center.x + offset.x - w / 2, y: center.y + offset.y - h / 2, ...(baseWidth != null ? { baseWidth } : {}), ...(reflowText && start.autoWidth ? { autoWidth: false } : {}) }
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', borderWidth: FRAME_WIDTH, borderColor: colors.primary },
  frameLocked: { borderStyle: 'dashed', borderColor: colors.textMuted },
  handle: { position: 'absolute' },
  handleBase: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    shadowColor: colors.text,
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2 },
  cornerHandle: { borderRadius: HANDLE / 2 },
  edgeHandle: { backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  sideGrip: { width: 8, height: 24, borderRadius: 4, borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.surface },
  rotateHandle: {
    width: ROTATE_HANDLE,
    height: ROTATE_HANDLE,
    borderRadius: ROTATE_HANDLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderColor: colors.surface,
    borderWidth: 1,
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  // 회전 손잡이 선은 선택 테두리 바깥 선에서 멈춘다 (테두리를 요소 바깥에 그리므로 그만큼 짧게)
  rotateStem: { position: 'absolute', width: FRAME_WIDTH, height: ROTATE_OFFSET - FRAME_WIDTH, backgroundColor: colors.primary },
})
