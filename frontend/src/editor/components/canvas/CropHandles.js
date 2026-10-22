import { useRef } from 'react'
import { Image, Platform, StyleSheet, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { usePan } from '../../hooks/usePan'
import { clamp, rotateVector } from '../../utils/common'
import { useMediaUri } from '../../hooks/useMediaUri'
import { coverLayout } from '../../utils/objects'

const MIN_SIZE = 24 // 논리 좌표
const TOUCH = 40 // 손잡이 터치 영역 (화면 px)
const BAR = 22 // 손잡이 길이
const THICK = 5

const HANDLES = [
  { key: 'nw', sx: -1, sy: -1 },
  { key: 'n', sx: 0, sy: -1 },
  { key: 'ne', sx: 1, sy: -1 },
  { key: 'e', sx: 1, sy: 0 },
  { key: 'se', sx: 1, sy: 1 },
  { key: 's', sx: 0, sy: 1 },
  { key: 'sw', sx: -1, sy: 1 },
  { key: 'w', sx: -1, sy: 0 },
]

/**
 * PPT 자르기처럼 사진 테두리의 자르기 손잡이를 끌어 자유롭게 자른다.
 * 사진은 페이지에서 제자리에 있고, 보이는 틀만 줄거나 (사진 범위 안에서) 늘어난다.
 * 틀이 바뀐 만큼 crop(fx, fy, zoom)을 다시 계산해 사진 위치·크기를 그대로 유지한다.
 */
export default function CropHandles({ photo, zoom, dispatch }) {
  const width = photo.w * zoom
  const height = photo.h * zoom
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: photo.x * zoom,
        top: photo.y * zoom,
        width,
        height,
        transform: [{ rotate: `${photo.rotation}deg` }],
      }}
    >
      <TrimmedArea photo={photo} zoom={zoom} />
      {HANDLES.map((handle) => (
        <CropHandle
          key={handle.key}
          handle={handle}
          photo={photo}
          zoom={zoom}
          width={width}
          height={height}
          dispatch={dispatch}
        />
      ))}
    </View>
  )
}

/** 잘려 나간 부분까지 사진 전체를 흐리게 보여 준다. (어디까지 다시 늘릴 수 있는지 보이도록) */
function TrimmedArea({ photo, zoom }) {
  const uri = useMediaUri(photo)
  const image = coverLayout(photo, photo.w * zoom, photo.h * zoom)
  const left = photo.flipX ? photo.w * zoom - image.left - image.width : image.left
  const top = photo.flipY ? photo.h * zoom - image.top - image.height : image.top
  const transform = [photo.flipX && { scaleX: -1 }, photo.flipY && { scaleY: -1 }].filter(Boolean)
  return (
    <Image
      source={uri ? { uri } : null}
      pointerEvents="none"
      resizeMode="stretch"
      style={[styles.trimmed, { left, top, width: image.width, height: image.height }, transform.length > 0 && { transform }]}
    />
  )
}

function CropHandle({ handle, photo, zoom, width, height, dispatch }) {
  const start = useRef(null)
  const panHandlers = usePan({
    onStart: () => {
      // 틀 기준 사진 위치 (논리 좌표, 반전 전 기준)
      start.current = { photo, image: coverLayout(photo, photo.w, photo.h) }
    },
    onMove: (dx, dy) => {
      const s = start.current
      if (s) dispatch({ type: 'updateObject', id: photo.id, patch: cropPatch(s.photo, s.image, handle, dx / zoom, dy / zoom) })
    },
  })

  const { sx, sy } = handle
  const corner = sx && sy
  const cx = ((sx + 1) / 2) * width
  const cy = ((sy + 1) / 2) * height
  return (
    <View
      {...panHandlers}
      style={[
        styles.touch,
        { left: cx - TOUCH / 2, top: cy - TOUCH / 2 },
        Platform.OS === 'web' && { cursor: CURSORS[handle.key] },
      ]}
      accessibilityLabel="자르기 손잡이"
    >
      {/* 서비스 주색(하늘 남색) 둥근 손잡이. 모서리는 둥근 ㄱ자, 변은 알약 모양. 흰 테두리로 어두운 사진 위에서도 보이게 한다. */}
      {corner ? (
        <View
          pointerEvents="none"
          style={[
            styles.corner,
            {
              left: sx < 0 ? TOUCH / 2 - THICK / 2 : TOUCH / 2 - BAR + THICK / 2,
              top: sy < 0 ? TOUCH / 2 - THICK / 2 : TOUCH / 2 - BAR + THICK / 2,
              [sx < 0 ? 'borderLeftWidth' : 'borderRightWidth']: THICK,
              [sy < 0 ? 'borderTopWidth' : 'borderBottomWidth']: THICK,
              [`border${sy < 0 ? 'Top' : 'Bottom'}${sx < 0 ? 'Left' : 'Right'}Radius`]: 9,
            },
          ]}
        />
      ) : (
        <View
          pointerEvents="none"
          style={[
            styles.pill,
            sx
              ? { left: TOUCH / 2 - THICK / 2 - 1.5, top: TOUCH / 2 - BAR / 2, width: THICK + 3, height: BAR }
              : { left: TOUCH / 2 - BAR / 2, top: TOUCH / 2 - THICK / 2 - 1.5, width: BAR, height: THICK + 3 },
          ]}
        />
      )}
    </View>
  )
}

const CURSORS = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}

/**
 * 틀의 변을 옮긴 결과. 변은 사진 밖으로 나갈 수 없고 최소 크기를 지킨다.
 * 계산은 '사진 내용' 좌표에서 하고(좌우·상하 반전이면 끄는 변이 반대쪽), 화면 위치는 다시 반전해 정한다.
 */
function cropPatch(photo, image, handle, dx, dy) {
  const local = rotateVector(dx, dy, -photo.rotation)
  const fx = photo.flipX ? -1 : 1
  const fy = photo.flipY ? -1 : 1
  const sx = handle.sx * fx
  const sy = handle.sy * fy
  const mx = local.x * fx
  const my = local.y * fy

  const imgRight = image.left + image.width
  const imgBottom = image.top + image.height
  let left = 0
  let top = 0
  let right = photo.w
  let bottom = photo.h
  if (sx < 0) left = clamp(mx, image.left, right - MIN_SIZE)
  if (sx > 0) right = clamp(photo.w + mx, left + MIN_SIZE, imgRight)
  if (sy < 0) top = clamp(my, image.top, bottom - MIN_SIZE)
  if (sy > 0) bottom = clamp(photo.h + my, top + MIN_SIZE, imgBottom)

  const w = right - left
  const h = bottom - top
  // 사진 크기는 그대로: 새 틀에서 cover 배율 대비 얼마나 확대인지로 zoom 을 정한다.
  const scale = image.width / photo.imageWidth
  const base = Math.max(w / photo.imageWidth, h / photo.imageHeight)
  const overflowX = image.width - w
  const overflowY = image.height - h
  const crop = {
    zoom: scale / base,
    fx: overflowX > 0.01 ? clamp((left - image.left) / overflowX, 0, 1) : 0.5,
    fy: overflowY > 0.01 ? clamp((top - image.top) / overflowY, 0, 1) : 0.5,
  }

  // 틀 중심 이동: 내용 좌표 → 화면(반전) → 페이지(회전)
  const shift = { x: ((left + right) / 2 - photo.w / 2) * fx, y: ((top + bottom) / 2 - photo.h / 2) * fy }
  const offset = rotateVector(shift.x, shift.y, photo.rotation)
  const cx = photo.x + photo.w / 2 + offset.x
  const cy = photo.y + photo.h / 2 + offset.y
  return { w, h, x: cx - w / 2, y: cy - h / 2, crop, ratio: 'free' }
}

const styles = StyleSheet.create({
  trimmed: { position: 'absolute', opacity: 0.28 },
  touch: { position: 'absolute', width: TOUCH, height: TOUCH },
  corner: {
    position: 'absolute',
    width: BAR,
    height: BAR,
    borderColor: colors.primary,
  },
  pill: {
    position: 'absolute',
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.surface,
    backgroundColor: colors.primary,
    shadowColor: colors.text,
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 0 },
  },
})
