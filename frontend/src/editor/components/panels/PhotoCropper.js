import CropViewport from '../controls/CropViewport'
import EditorModal from '../controls/EditorModal'
import { useRef, useState } from 'react'
import { Image, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { colors, shadow } from '../../../shared/theme'
import { CROP_RATIOS, CROP_ZOOM_MAX, CROP_ZOOM_MIN, PHOTO_SHAPES, POLAROID_RATIOS } from '../../constants'
import { useMediaUri } from '../../hooks/useMediaUri'
import { usePan } from '../../hooks/usePan'
import { clamp } from '../../utils/common'
import { coverLayout, framedHeight, isBorderFrame, ratioValueOf, resizeAroundCenter } from '../../utils/objects'
import { photoCornerRadius } from '../canvas/ObjectView'
import Icon from '../controls/Icon'
import Slider from '../controls/Slider'

const CONTEXT_PX = 36 // 자르는 틀 둘레로 흐리게 보여 주는 사진 여유
const ORIGINAL = { fx: 0.5, fy: 0.5, zoom: 1 }
const FREE = { id: 'free', name: '자유' }
const FREE_PAD = 18 // 자유 자르기: 사진 둘레 여유 (손잡이가 잘리지 않게)
const FREE_MIN = 1 / CROP_ZOOM_MAX // 자유 자르기 틀의 최소 크기 (사진 대비) = 확대 900% 한도
// 꼭짓점 원은 편집 화면 회전 손잡이와 같은 크기, 변 손잡이는 선을 따라 놓이는 가는 바
const HANDLE = 18
const BAR_LONG = 24
const BAR_SHORT = 8

/**
 * 사진 자르기 창: 화면 가운데에 사진을 크게 띄운다. 옵션 패널과 같은 모양의 구역·막대·칩을 쓴다.
 * - 한 손가락: 끌어서 보이는 위치 / 두 손가락: 벌리고 오므려 확대 + 함께 끌어 이동
 * - 비율: 틀(폴라로이드 등)은 안쪽 사진 비율, 사각·라운드는 16:9 와 '자유'까지. 원형·하트·별은 정사각이라 없음
 * - 자유: 사진 전체를 보여 주고 자르는 틀의 모서리·변을 끌어 정한다. 틀은 사진 밖으로 나가지 않는다.
 *   확대하면 틀은 화면에서 그대로 두고 사진이 커진다. (다른 비율의 확대와 같은 느낌)
 * '적용'을 눌러야 사진에 반영된다 (취소하면 그대로).
 */
export default function PhotoCropper({ photo, onApply, onCancel }) {
  const window = useWindowDimensions()
  const uri = useMediaUri(photo)
  const bordered = isBorderFrame(photo.frame)
  const square = photo.frame === 'shape' && PHOTO_SHAPES.find((s) => s.id === photo.shape)?.square
  const ratios = bordered ? POLAROID_RATIOS : square ? [] : [...CROP_RATIOS, FREE]
  const [crop, setCrop] = useState(photo.crop ?? ORIGINAL)
  // 고른 비율 (null: 지금 크기 그대로 = 캔버스에서 자유로 잘랐던 비율)
  const [ratio, setRatio] = useState(ratios.some((r) => r.id === photo.ratio) ? photo.ratio : null)
  const free = ratio === FREE.id
  const imageAspect = photo.imageWidth / photo.imageHeight
  // 자유 자르기 틀: 사진 안의 비율 좌표 { u0, v0, u1, v1 } (0~1). 지금 보이는 영역에서 시작한다.
  const [rect, setRect] = useState(() => visibleRect(photo.crop ?? ORIGINAL, photo.w / photo.h, imageAspect))

  // 자르는 틀의 가로:세로
  const aspect = square
    ? 1
    : free
      ? ((rect.u1 - rect.u0) * photo.imageWidth) / ((rect.v1 - rect.v0) * photo.imageHeight)
      : ratio
      ? ratioValueOf(ratio, photo) ?? photo.imageWidth / photo.imageHeight
      : bordered
        ? photo.imageWidth / photo.imageHeight
        : photo.w / photo.h

  const cardWidth = Math.min(720, window.width - 48)
  const stageWidth = cardWidth - 48
  const stageHeight = Math.min(440, Math.max(220, window.height * 0.5))
  const fitW = stageWidth - CONTEXT_PX * 2
  const fitH = stageHeight - CONTEXT_PX * 2
  const frameWidth = Math.min(fitW, fitH * aspect)
  const frameHeight = frameWidth / aspect
  const frameLeft = (stageWidth - frameWidth) / 2
  const frameTop = (stageHeight - frameHeight) / 2
  const source = { imageWidth: photo.imageWidth, imageHeight: photo.imageHeight, crop }
  const layout = coverLayout(source, frameWidth, frameHeight)
  // 자유 자르기: 사진 전체를 무대 안에 맞춰 보여 준다
  const fullW = Math.min(stageWidth - FREE_PAD * 2, (stageHeight - FREE_PAD * 2) * imageAspect)
  const fullH = fullW / imageAspect
  const full = { left: (stageWidth - fullW) / 2, top: (stageHeight - fullH) / 2, width: fullW, height: fullH }
  // 자유 자르기 화면의 사진 자리. 확대하면 틀은 화면에서 그대로 두고 사진이 커진다. (null: 사진 전체가 보이게 맞춤)
  const [freeView, setFreeView] = useState(null)
  const view = freeView ?? full
  function zoomFree(zoom) {
    const next = freeTransform(rect, view, zoom, 0, 0)
    setRect(next.rect)
    setFreeView(next.view)
  }

  // 자유 자르기의 두 손가락: 벌리고 오므려 확대, 함께 끌어 사진 이동 (틀은 화면에서 그대로)
  const freeGesture = useRef(null)
  const freeStageHandlers = {
    onStartShouldSetResponderCapture: (event) => (event.nativeEvent.touches?.length ?? 0) >= 2,
    onMoveShouldSetResponderCapture: (event) => (event.nativeEvent.touches?.length ?? 0) >= 2,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (event) => {
      freeGesture.current = { rect, view, ...touchesOf(event) }
    },
    onResponderStart: (event) => {
      freeGesture.current = { rect, view, ...touchesOf(event) }
    },
    onResponderMove: (event) => {
      const g = freeGesture.current
      const now = touchesOf(event)
      if (!g || now.count < 2) return
      if (now.count !== g.count) {
        freeGesture.current = { rect, view, ...now }
        return
      }
      const zoom = clamp(freeZoom(g.rect) * (g.dist > 0 ? now.dist / g.dist : 1), 1, 1 / FREE_MIN)
      const next = freeTransform(g.rect, g.view, zoom, now.c.x - g.c.x, now.c.y - g.c.y)
      setRect(next.rect)
      setFreeView(next.view)
    },
    onResponderRelease: () => {
      freeGesture.current = null
    },
    onResponderTerminate: () => {
      freeGesture.current = null
    },
  }
  const frameRadius = square
    ? photo.shape === 'circle'
      ? frameWidth / 2
      : 0
    : photo.frame === 'shape'
      ? Math.min(frameWidth, frameHeight) * photoCornerRadius(photo)
      : 0

  // 손가락 수가 바뀔 때마다 그 순간의 crop·손가락 위치를 기준으로 다시 잡는다.
  const cropRef = useRef(crop)
  cropRef.current = crop
  const gesture = useRef(null)
  const touchesOf = (event) => {
    const list = event.nativeEvent.touches?.length ? event.nativeEvent.touches : [event.nativeEvent]
    const c = list.reduce((acc, t) => ({ x: acc.x + t.pageX / list.length, y: acc.y + t.pageY / list.length }), { x: 0, y: 0 })
    const dist = list.length > 1 ? Math.hypot(list[0].pageX - list[1].pageX, list[0].pageY - list[1].pageY) : 0
    return { count: list.length, c, dist }
  }
  const rebase = (event) => {
    gesture.current = { crop: cropRef.current, ...touchesOf(event) }
  }
  const stageHandlers = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: rebase,
    onResponderStart: rebase,
    onResponderEnd: (event) => {
      if (event.nativeEvent.touches?.length) rebase(event)
    },
    onResponderMove: (event) => {
      const g = gesture.current
      if (!g) return
      const now = touchesOf(event)
      if (now.count !== g.count) {
        rebase(event)
        return
      }
      const zoom = now.count > 1 && g.dist > 0 ? clamp(g.crop.zoom * (now.dist / g.dist), CROP_ZOOM_MIN, CROP_ZOOM_MAX) : g.crop.zoom
      const next = coverLayout({ ...source, crop: { ...g.crop, zoom } }, frameWidth, frameHeight)
      const overflowX = next.width - frameWidth
      const overflowY = next.height - frameHeight
      const dx = now.c.x - g.c.x
      const dy = now.c.y - g.c.y
      setCrop({
        zoom: Math.round(zoom * 100) / 100,
        fx: overflowX > 0 ? clamp(g.crop.fx - dx / overflowX, 0, 1) : g.crop.fx,
        fy: overflowY > 0 ? clamp(g.crop.fy - dy / overflowY, 0, 1) : g.crop.fy,
      })
    },
    onResponderRelease: () => {
      gesture.current = null
    },
    onResponderTerminate: () => {
      gesture.current = null
    },
  }

  // 적용: 보이는 영역 + (비율을 바꿨으면) 사진 크기를 그 비율로
  function apply() {
    if (free) {
      // 틀 = 보이는 영역이 되도록 crop 을 거꾸로 구한다 (coverLayout 과 같은 계산)
      const rw = rect.u1 - rect.u0
      const rh = rect.v1 - rect.v0
      const freeCrop = {
        zoom: Math.round((1 / Math.max(rw, rh)) * 1000) / 1000,
        fx: rw < 0.999 ? clamp(rect.u0 / (1 - rw), 0, 1) : 0.5,
        fy: rh < 0.999 ? clamp(rect.v0 / (1 - rh), 0, 1) : 0.5,
      }
      const long = Math.max(photo.w, photo.h)
      const w = aspect >= 1 ? long : long * aspect
      onApply({ crop: freeCrop, ratio: FREE.id, ...resizeAroundCenter(photo, w, w / aspect) })
      return
    }
    const patch = { crop }
    if (ratio && ratio !== photo.ratio) {
      patch.ratio = ratio
      if (bordered) {
        Object.assign(patch, resizeAroundCenter(photo, photo.w, framedHeight(photo.w, ratio, photo)))
      } else {
        const value = ratioValueOf(ratio, photo) ?? photo.imageWidth / photo.imageHeight
        // 넓이를 지키되 너무 길쭉해지지 않게 긴 변을 지금 긴 변에 맞춘다.
        const long = Math.max(photo.w, photo.h)
        const w = value >= 1 ? long : long * value
        Object.assign(patch, resizeAroundCenter(photo, w, w / value))
      }
    }
    onApply(patch)
  }

  return (
    <EditorModal transparent animationType="none" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <CropViewport>
        <View style={[styles.card, { width: cardWidth }]}>
          <View style={styles.header}>
            <View style={styles.titleGroup}>
              <Text style={styles.cardTitle}>사진 자르기</Text>
            </View>
            <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="자르기 닫기">
              <Icon name="close" size={20} />
            </Pressable>
          </View>


          {free ? (
            <View style={[styles.stage, { height: stageHeight }]} {...freeStageHandlers}>
              <FreeCrop uri={uri} full={view} rect={rect} onChange={setRect} />
            </View>
          ) : (
          <View style={[styles.stage, { height: stageHeight }]} {...stageHandlers}>
            {/* 틀 밖까지 이어지는 사진 (흐리게) */}
            <Image
              source={uri ? { uri } : null}
              style={[
                styles.context,
                { left: frameLeft + layout.left, top: frameTop + layout.top, width: layout.width, height: layout.height },
              ]}
              resizeMode="stretch"
              pointerEvents="none"
            />
            <View
              style={[
                styles.frame,
                { left: frameLeft, top: frameTop, width: frameWidth, height: frameHeight, borderRadius: frameRadius },
              ]}
              pointerEvents="none"
            >
              <Image source={uri ? { uri } : null} style={[styles.inner, layout]} resizeMode="stretch" />
            </View>
            <View
              style={[
                styles.frameLine,
                {
                  left: frameLeft - 2,
                  top: frameTop - 2,
                  width: frameWidth + 4,
                  height: frameHeight + 4,
                  borderRadius: frameRadius ? frameRadius + 2 : 3,
                },
              ]}
              pointerEvents="none"
            />
          </View>
          )}

          {ratios.length > 0 && (
            <Section title="비율">
              <View style={styles.chips}>
                {ratios.map((item) => (
                  <Chip key={item.id} label={item.name} active={ratio === item.id} onPress={() => setRatio(item.id)} />
                ))}
              </View>
            </Section>
          )}

          {free && (
            <Section title="확대">
              <Slider
                value={freeZoom(rect)}
                min={1}
                max={1 / FREE_MIN}
                step={0.1}
                minusLabel="사진 축소"
                plusLabel="사진 확대"
                scale={100}
                unit="%"
                label="확대"
                onChange={zoomFree}
              />
            </Section>
          )}
          {!free && (
          <Section title="확대">
            <Slider
              value={crop.zoom}
              min={CROP_ZOOM_MIN}
              max={CROP_ZOOM_MAX}
              step={0.1}
              minusLabel="사진 축소"
              plusLabel="사진 확대"
              scale={100}
              unit="%"
              label="확대"
              onChange={(zoom) => setCrop((prev) => ({ ...prev, zoom: Math.round(zoom * 100) / 100 }))}
            />
          </Section>
          )}

          <View style={styles.footer}>
            <Chip
              label="초기화"
              icon="reset"
              onPress={() => {
                if (!free) {
                  setCrop(ORIGINAL)
                  return
                }
                setRect({ u0: 0, v0: 0, u1: 1, v1: 1 })
                setFreeView(null)
              }}
            />
            <View style={styles.footerRight}>
              <Chip label="취소" onPress={onCancel} />
              <Pressable
                onPress={apply}
                accessibilityRole="button"
                style={({ pressed }) => [styles.chip, styles.confirm, pressed && styles.pressed]}
              >
                <Text style={[styles.chipText, styles.confirmText]}>적용</Text>
              </Pressable>
            </View>
          </View>
        </View>
        </CropViewport>
      </View>
    </EditorModal>
  )
}

/** 지금 crop 으로 보이는 영역을 사진 안의 비율 좌표로 (boxAspect: 사진 상자 가로:세로) */
function visibleRect(crop, boxAspect, imageAspect) {
  const vw = Math.min(1, Math.min(1, boxAspect / imageAspect) / crop.zoom)
  const vh = Math.min(1, Math.min(1, imageAspect / boxAspect) / crop.zoom)
  const u0 = crop.fx * (1 - vw)
  const v0 = crop.fy * (1 - vh)
  return { u0, v0, u1: u0 + vw, v1: v0 + vh }
}

/** 자유 자르기 확대: 틀이 사진 안에서 가장 클 때(긴 쪽이 사진에 꽉 참)가 100% */
function freeZoom(rect) {
  return 1 / Math.max(rect.u1 - rect.u0, rect.v1 - rect.v0)
}

/** 틀 모양(가로:세로)은 그대로 두고 가운데 기준으로 키우거나 줄인다. 사진 밖으로는 나가지 않게 */
function zoomRect(rect, zoom) {
  const rw = rect.u1 - rect.u0
  const rh = rect.v1 - rect.v0
  const k = 1 / zoom / Math.max(rw, rh)
  const w = Math.min(1, rw * k)
  const h = Math.min(1, rh * k)
  const cx = clamp((rect.u0 + rect.u1) / 2, w / 2, 1 - w / 2)
  const cy = clamp((rect.v0 + rect.v1) / 2, h / 2, 1 - h / 2)
  return { u0: cx - w / 2, v0: cy - h / 2, u1: cx + w / 2, v1: cy + h / 2 }
}

/**
 * 자유 자르기 화면 변환: 틀 가운데를 화면 제자리에 두고 zoom 만큼 확대한 뒤, 사진을 (dx, dy)px 만큼 옮긴다.
 * 틀(사진 안의 비율 좌표)은 사진 밖으로 나가지 않는다. 돌려주는 값: { rect, view }
 */
function freeTransform(rect, view, zoom, dx, dy) {
  const k = zoom / freeZoom(rect)
  const center = {
    x: view.left + ((rect.u0 + rect.u1) / 2) * view.width,
    y: view.top + ((rect.v0 + rect.v1) / 2) * view.height,
  }
  const width = view.width * k
  const height = view.height * k
  let next = zoomRect(rect, zoom)
  // 사진이 손가락을 따라 움직이면 틀이 보는 사진 영역은 반대로 옮겨진다
  const rw = next.u1 - next.u0
  const rh = next.v1 - next.v0
  const u0 = clamp(next.u0 - dx / width, 0, 1 - rw)
  const v0 = clamp(next.v0 - dy / height, 0, 1 - rh)
  next = { u0, v0, u1: u0 + rw, v1: v0 + rh }
  return {
    rect: next,
    view: {
      left: center.x - ((next.u0 + next.u1) / 2) * width,
      top: center.y - ((next.v0 + next.v1) / 2) * height,
      width,
      height,
    },
  }
}

// 자유 자르기 손잡이: 모서리 4 + 변 4. sx·sy 는 움직이는 쪽 (-1 왼쪽/위, 1 오른쪽/아래, 0 그대로)
const FREE_HANDLES = [
  { key: 'nw', sx: -1, sy: -1 },
  { key: 'n', sx: 0, sy: -1 },
  { key: 'ne', sx: 1, sy: -1 },
  { key: 'e', sx: 1, sy: 0 },
  { key: 'se', sx: 1, sy: 1 },
  { key: 's', sx: 0, sy: 1 },
  { key: 'sw', sx: -1, sy: 1 },
  { key: 'w', sx: -1, sy: 0 },
]

/** 사진 전체 위에 자르는 틀. 틀 안을 끌면 옮기고, 손잡이를 끌면 크기를 바꾼다. 모두 사진 안에서만. */
function FreeCrop({ uri, full, rect, onChange }) {
  const x0 = full.left + rect.u0 * full.width
  const y0 = full.top + rect.v0 * full.height
  const w = (rect.u1 - rect.u0) * full.width
  const h = (rect.v1 - rect.v0) * full.height
  const inner = { left: -rect.u0 * full.width, top: -rect.v0 * full.height, width: full.width, height: full.height }
  return (
    <>
      <Image source={uri ? { uri } : null} style={[styles.context, full]} resizeMode="stretch" pointerEvents="none" />
      <View style={[styles.frame, { left: x0, top: y0, width: w, height: h }]} pointerEvents="none">
        <Image source={uri ? { uri } : null} style={[styles.inner, inner]} resizeMode="stretch" />
      </View>
      <MoveArea rect={rect} full={full} onChange={onChange} style={{ left: x0, top: y0, width: w, height: h }} />
      <View style={[styles.freeLine, { left: x0, top: y0, width: w, height: h }]} pointerEvents="none" />
      {FREE_HANDLES.map((handle) => (
        <FreeHandle
          key={handle.key}
          handle={handle}
          rect={rect}
          full={full}
          onChange={onChange}
          // 손잡이는 틀 선 위에 가운데 정렬 (틀 자체는 사진 밖으로 못 나가게 막는다)
          center={{ x: x0 + ((handle.sx + 1) / 2) * w, y: y0 + ((handle.sy + 1) / 2) * h }}
        />
      ))}
    </>
  )
}

function MoveArea({ rect, full, onChange, style }) {
  const start = useRef(rect)
  const handlers = usePan({
    onStart: () => {
      start.current = rect
    },
    onMove: (dx, dy) => {
      const r = start.current
      const rw = r.u1 - r.u0
      const rh = r.v1 - r.v0
      const u0 = clamp(r.u0 + dx / full.width, 0, 1 - rw)
      const v0 = clamp(r.v0 + dy / full.height, 0, 1 - rh)
      onChange({ u0, v0, u1: u0 + rw, v1: v0 + rh })
    },
  })
  return <View {...handlers} style={[styles.moveArea, style]} accessibilityLabel="자르는 틀 옮기기" />
}

function FreeHandle({ handle, rect, full, onChange, center }) {
  const start = useRef(rect)
  const handlers = usePan({
    onStart: () => {
      start.current = rect
    },
    onMove: (dx, dy) => {
      const r = { ...start.current }
      const du = dx / full.width
      const dv = dy / full.height
      // 움직이는 변만 옮기고, 사진 밖(0~1)과 최소 크기를 넘지 않게 막는다.
      if (handle.sx < 0) r.u0 = clamp(r.u0 + du, 0, r.u1 - FREE_MIN)
      if (handle.sx > 0) r.u1 = clamp(r.u1 + du, r.u0 + FREE_MIN, 1)
      if (handle.sy < 0) r.v0 = clamp(r.v0 + dv, 0, r.v1 - FREE_MIN)
      if (handle.sy > 0) r.v1 = clamp(r.v1 + dv, r.v0 + FREE_MIN, 1)
      onChange(r)
    },
  })
  const corner = handle.sx && handle.sy
  // 꼭짓점은 원, 위·아래 변은 가로 바, 왼쪽·오른쪽 변은 세로 바
  const size = corner
    ? { width: HANDLE, height: HANDLE }
    : handle.sy
      ? { width: BAR_LONG, height: BAR_SHORT }
      : { width: BAR_SHORT, height: BAR_LONG }
  return (
    <View
      {...handlers}
      hitSlop={14}
      style={[
        styles.freeHandle,
        corner ? styles.freeCorner : styles.freeEdge,
        size,
        { left: center.x - size.width / 2, top: center.y - size.height / 2 },
      ]}
      accessibilityLabel={`자르는 틀 ${handle.key}`}
    />
  )
}

/** 옵션 패널과 같은 구역: 작은 회색 제목 */
function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  )
}

/** 옵션 패널과 같은 칩 버튼 */
function Chip({ label, icon, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={active != null ? { selected: active } : undefined}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
    >
      {icon && <Icon name={icon} size={15} />}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlay },
  card: { padding: 24, borderRadius: 24, backgroundColor: colors.surface, ...shadow.float },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  hint: { marginTop: 6, fontSize: 12.5, color: colors.textMuted },
  stage: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    // 웹: 두 손가락 확대가 브라우저 화면 확대로 새지 않게
    ...Platform.select({ web: { touchAction: 'none' }, default: {} }),
  },
  context: { position: 'absolute', opacity: 0.3 },
  frame: { position: 'absolute', overflow: 'hidden' },
  inner: { position: 'absolute' },
  frameLine: { position: 'absolute', borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primary },
  freeLine: { position: 'absolute', borderWidth: 2, borderColor: colors.primary },
  moveArea: { position: 'absolute' },
  freeHandle: {
    position: 'absolute',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  freeCorner: { borderRadius: HANDLE / 2 },
  freeEdge: { borderRadius: BAR_SHORT / 2 },
  section: { marginTop: 14 },
  title: { marginBottom: 8, fontSize: 12, fontWeight: '700', color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { backgroundColor: colors.primarySoft },
  chipText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  chipTextActive: { fontWeight: '800' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 },
  footerRight: { flexDirection: 'row', gap: 8 },
  // 적용: 흰 바탕에 남색 글씨 (다른 버튼과 같은 모양에 테두리·글씨만 진하게)
  confirm: { borderColor: colors.text },
  confirmText: { color: colors.text, fontWeight: '800' },
})
