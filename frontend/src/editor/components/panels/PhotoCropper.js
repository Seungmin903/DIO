import CropViewport from '../controls/CropViewport'
import EditorModal from '../controls/EditorModal'
import { useRef, useState } from 'react'
import { Image, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { colors, shadow } from '../../../shared/theme'
import { CROP_RATIOS, CROP_ZOOM_MAX, PHOTO_SHAPES, POLAROID_RATIOS } from '../../constants'
import { useMediaUri } from '../../hooks/useMediaUri'
import { usePan } from '../../hooks/usePan'
import { clamp } from '../../utils/common'
import { changeCropRatio, cropFromRect, fitAspect, freeTransform, freeZoom, resizeFreeCrop, visibleRect } from '../../utils/photoCropGeometry.js'
import { framedHeight, isBorderFrame, photoInnerBox, ratioValueOf, resizeAroundCenter } from '../../utils/objects'
import Icon from '../controls/Icon'
import Slider from '../controls/Slider'

const ORIGINAL = { fx: 0.5, fy: 0.5, zoom: 1 }
const FREE = { id: 'free', name: '자유' }
const FREE_PAD = 18 // 자유 자르기: 사진 둘레 여유 (손잡이가 잘리지 않게)
const FREE_MIN = 1 / CROP_ZOOM_MAX // 확대 막대의 기본 한도
// 자유 비율의 변은 선처럼 얇게 자를 수 있게 하되 양쪽 변이 모두 0에 가까워지지 않게 한다.
const FREE_SELECTION_MIN = 1 / 32
// 꼭짓점 원은 편집 화면 회전 손잡이와 같은 크기, 변 손잡이는 선을 따라 놓이는 가는 바
const HANDLE = 18
const BAR_LONG = 24
const BAR_SHORT = 8
const GAP_MIN = 6 // 손잡이끼리 이만큼은 띄운다

/**
 * 사진 자르기 창: 화면 가운데에 사진을 크게 띄운다. 옵션 패널과 같은 모양의 구역·막대·칩을 쓴다.
 * - 한 손가락: 끌어서 보이는 위치 / 두 손가락: 벌리고 오므려 확대 + 함께 끌어 이동
 * - 비율: 틀(폴라로이드 등)은 안쪽 사진 비율, 사각·라운드는 16:9 와 '자유'까지. 원형·하트·별은 정사각이라 없음
 * - 자유: 사진 전체를 보여 주고 자르는 틀의 모서리·변을 끌어 정한다. 틀은 사진 밖으로 나가지 않는다.
 *   확대하면 틀은 화면에서 그대로 두고 사진이 커진다. (다른 비율의 확대와 같은 느낌)
 * '적용'을 눌러야 사진에 반영된다 (취소하면 그대로).
 * fixedAspect: 칸 비율이 정해진 곳(여러 칸 틀의 칸)은 비율 고르기 없이 보이는 영역·확대만 정한다 (적용하면 { crop } 만).
 *
 * 앱의 사진 넣기 · 자르기 창은 모두 이 창 하나를 쓴다(2026-11-02 통일). 손짓은 어디서나 같다:
 * 한 손가락 = 틀 옮기기, 두 손가락 = 확대 · 축소(+ 함께 끌어 이동), 핸들 = 틀 크기(비율이 고정이면 꼭짓점만, 끌어도 비율 유지).
 * 기능마다 다른 점은 옵션으로만 준다: fixedAspect(비율 고정) · aspectRange([최소, 최대] 가로:세로, 자유 비율의 범위) ·
 * round(동그라미 틀, 프로필) · extra(추가 조절, 테이프 두께) · confirmLabel. 적용하면 { crop, aspect, rect(사진 안 0~1 영역) } 를 함께 넘긴다.
 */
// 여러 장을 차례로 자를 때 창을 닫았다 열지 않고 안쪽만 바꾼다(창을 다시 만들면 화면이 튄다). bodyKey 가 바뀌면 자르기 상태를 새로 시작한다.
export default function PhotoCropper({ bodyKey, ...props }) {
  return (
    <EditorModal transparent animationType="none" onRequestClose={props.onCancel}>
      <PhotoCropperBody key={bodyKey} {...props} />
    </EditorModal>
  )
}

function PhotoCropperBody({ photo, onApply, onCancel, fixedAspect, aspectRange, round = false, extra = null, confirmLabel = '적용', title = '사진 자르기' }) {
  const window = useWindowDimensions()
  const uri = useMediaUri(photo)
  const bordered = isBorderFrame(photo.frame)
  const square = photo.frame === 'shape' && PHOTO_SHAPES.find((s) => s.id === photo.shape)?.square
  const ratios = fixedAspect || aspectRange || round ? [] : bordered ? POLAROID_RATIOS : square ? [] : [...CROP_RATIOS, FREE]
  // 고른 비율 (null: 지금 크기 그대로 = 캔버스에서 자유로 잘랐던 비율)
  const [ratio, setRatio] = useState(aspectRange ? FREE.id : ratios.some((r) => r.id === photo.ratio) ? photo.ratio : null)
  const free = ratio === FREE.id
  const imageAspect = photo.imageWidth / photo.imageHeight
  // 자유 자르기 틀: 사진 안의 비율 좌표 { u0, v0, u1, v1 } (0~1). 지금 보이는 영역에서 시작한다.
  // 보이는 영역은 캔버스가 사진을 그리는 안쪽 상자 비율로 잰다(폴라로이드 · 필름처럼 여백 있는 틀은 바깥 w/h 와 다르다)
  const inner = photoInnerBox(photo)
  const [rect, setRect] = useState(() => visibleRect(photo.crop ?? ORIGINAL, fixedAspect ?? (square || round ? 1 : inner.width / inner.height), imageAspect))

  // 잠근 비율(가로:세로, 사진 픽셀 기준). 자유면 null — 틀 모양은 핸들로 정한다(aspectRange 가 있으면 그 범위 안에서)
  const lockAspectOf = (id) => (fixedAspect ?? (square || round ? 1 : id === FREE.id ? null
    : id ? ratioValueOf(id, photo) ?? imageAspect : bordered ? imageAspect : photo.w / photo.h))
  const lockAspect = lockAspectOf(ratio)
  // 비율 칩을 바꾸면 틀을 그 비율로 다시 맞춘다(가운데 기준, 사진 안에서 가장 크게)
  const pickRatio = (id) => {
    setRatio(id)
    const lock = lockAspectOf(id)
    if (lock) setRect((prev) => changeCropRatio(prev, lock / imageAspect))
  }
  // 자르는 틀의 가로:세로
  const aspect = fixedAspect
    ? fixedAspect
    : square || round
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
  // 비율 칩 · 확대 · 버튼이 판 아래에 붙는다. 폰은 칩이 두 줄이고 시스템 바가 아래를 가려, 카드가 화면 밖으로 잘리지 않게 그만큼을 뺀다
  const reserve = window.width < 600 ? 540 : 450
  const stageHeight = Math.min(440, Math.max(180, Math.min(window.height * 0.5, window.height - reserve)))
  // 자유 자르기: 사진 전체를 무대 안에 맞춰 보여 준다
  const fullW = Math.min(stageWidth - FREE_PAD * 2, (stageHeight - FREE_PAD * 2) * imageAspect)
  const fullH = fullW / imageAspect
  const full = { left: (stageWidth - fullW) / 2, top: (stageHeight - fullH) / 2, width: fullW, height: fullH }
  // 자유 자르기 화면의 사진 자리. 확대하면 틀은 화면에서 그대로 두고 사진이 커진다. (null: 사진 전체가 보이게 맞춤)
  const [freeView, setFreeView] = useState(null)
  const [sliderMax, setSliderMax] = useState(null)
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
      // 손잡이로 900%보다 작은 영역을 골랐다면 핀치 시작 시 갑자기 이전 한도로 돌아가지 않게 한다.
      const zoom = clamp(freeZoom(g.rect) * (g.dist > 0 ? now.dist / g.dist : 1), 1, Math.max(1 / FREE_MIN, freeZoom(g.rect)))
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
  const touchesOf = (event) => {
    const list = event.nativeEvent.touches?.length ? event.nativeEvent.touches : [event.nativeEvent]
    const c = list.reduce((acc, t) => ({ x: acc.x + t.pageX / list.length, y: acc.y + t.pageY / list.length }), { x: 0, y: 0 })
    const dist = list.length > 1 ? Math.hypot(list[0].pageX - list[1].pageX, list[0].pageY - list[1].pageY) : 0
    return { count: list.length, c, dist }
  }
  // 적용: 보이는 영역 + (비율을 바꿨으면) 사진 크기를 그 비율로
  function apply() {
    // 틀 = 보이는 영역이 되도록 crop 을 거꾸로 구한다 (coverLayout 과 같은 계산)
    const crop = cropFromRect(rect)
    const extras = { aspect, rect }
    if (free) {
      const long = Math.max(photo.w, photo.h)
      const w = aspect >= 1 ? long : long * aspect
      onApply({ crop, ratio: FREE.id, ...resizeAroundCenter(photo, w, w / aspect), ...extras })
      return
    }
    if (fixedAspect || round) {
      onApply({ crop, ...extras })
      return
    }
    const patch = { crop, ...extras }
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
      <View style={styles.backdrop}>
        <CropViewport>
        <View style={[styles.card, { width: cardWidth }]}>
          <View style={styles.header}>
            <View style={styles.titleGroup}>
              <Text style={styles.cardTitle}>{title}</Text>
            </View>
            <Pressable onPress={onCancel} hitSlop={14} accessibilityLabel="자르기 닫기">
              <Icon name="close" size={20} />
            </Pressable>
          </View>


          {/* 모든 모드가 같은 틀: 한 손가락 = 틀 옮기기, 두 손가락 = 확대, 핸들 = 틀 크기(비율 잠금이면 꼭짓점만) */}
          <View style={[styles.stage, { height: stageHeight }]} {...freeStageHandlers}>
            <FreeCrop uri={uri} full={view} rect={rect} onChange={setRect}
              lock={lockAspect ? lockAspect / imageAspect : null}
              range={aspectRange ? [aspectRange[0] / imageAspect, aspectRange[1] / imageAspect] : null}
              round={round || (square && photo.shape === 'circle')} />
          </View>

          {ratios.length > 0 && (
            <Section title="비율">
              <View style={styles.chips}>
                {ratios.map((item) => (
                  <Chip key={item.id} label={item.name} active={ratio === item.id} onPress={() => pickRatio(item.id)} />
                ))}
              </View>
            </Section>
          )}

          {extra}
          <Section title="확대">
            <Slider
              value={freeZoom(rect)}
              min={1}
              max={sliderMax ?? Math.max(1 / FREE_MIN, freeZoom(rect))}
              onStart={() => setSliderMax(Math.max(1 / FREE_MIN, freeZoom(rect)))}
              onEnd={() => setSliderMax(null)}
              step={0.1}
              minusLabel="사진 축소"
              plusLabel="사진 확대"
              scale={100}
              unit="%"
              label="확대"
              onChange={zoomFree}
            />
          </Section>

          <View style={styles.footer}>
            <Chip
              label="초기화"
              icon="reset"
              onPress={() => {
                setRect(lockAspect ? fitAspect({ u0: 0, v0: 0, u1: 1, v1: 1 }, lockAspect / imageAspect) : { u0: 0, v0: 0, u1: 1, v1: 1 })
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
                <Text style={[styles.chipText, styles.confirmText]}>{confirmLabel}</Text>
              </Pressable>
            </View>
          </View>
        </View>
        </CropViewport>
      </View>
  )
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

/**
 * 틀이 작아 손잡이끼리 겹치면 덜 쓰는 쪽을 숨긴다(지라 607: 얇은 테이프 틀에서 위 · 아래 손잡이가 포개졌다).
 * 낮은 틀은 아래 꼭짓점만, 좁은 틀은 오른쪽 꼭짓점만, 변 막대는 두 꼭짓점 사이에 들어갈 때만. 꼭짓점은 늘 하나 이상 남는다.
 */
export function visibleFreeHandles(width, height, lock = false) {
  // 꼭짓점 원(18)끼리는 6 이상, 변 막대(24)는 양끝 꼭짓점과 6 이상 떨어질 때만 둔다
  const shortH = height < HANDLE + GAP_MIN, shortW = width < HANDLE + GAP_MIN
  const barFits = length => length >= HANDLE + BAR_LONG + GAP_MIN * 2
  return FREE_HANDLES.filter(handle => {
    if (handle.sx && handle.sy) return !(shortH && handle.sy < 0) && !(shortW && handle.sx < 0)
    if (lock) return false
    return handle.sy ? barFits(width) : barFits(height)
  })
}

/** 사진 전체 위에 자르는 틀. 틀 안을 끌면 옮기고, 손잡이를 끌면 크기를 바꾼다. 모두 사진 안에서만. */
// lock: 잠근 비율(사진 안 좌표의 가로:세로), range: 자유 비율의 [최소, 최대](같은 좌표), round: 동그라미 틀
function FreeCrop({ uri, full, rect, onChange, lock = null, range = null, round = false }) {
  const x0 = full.left + rect.u0 * full.width
  const y0 = full.top + rect.v0 * full.height
  const w = (rect.u1 - rect.u0) * full.width
  const h = (rect.v1 - rect.v0) * full.height
  const inner = { left: -rect.u0 * full.width, top: -rect.v0 * full.height, width: full.width, height: full.height }
  return (
    <>
      <Image source={uri ? { uri } : null} style={[styles.context, full]} resizeMode="stretch" pointerEvents="none" />
      <View style={[styles.frame, { left: x0, top: y0, width: w, height: h }, round && { borderRadius: Math.min(w, h) / 2 }]} pointerEvents="none">
        <Image source={uri ? { uri } : null} style={[styles.inner, inner]} resizeMode="stretch" />
      </View>
      <MoveArea rect={rect} full={full} onChange={onChange} style={{ left: x0, top: y0, width: w, height: h }} />
      <View style={[styles.freeLine, { left: x0, top: y0, width: w, height: h }, round && { borderRadius: Math.min(w, h) / 2 }]} pointerEvents="none" />
      {visibleFreeHandles(w, h, Boolean(lock)).map((handle) => (
        <FreeHandle
          key={handle.key}
          handle={handle}
          rect={rect}
          full={full}
          lock={lock}
          range={range}
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

function FreeHandle({ handle, rect, full, lock, range, onChange, center }) {
  const start = useRef(rect)
  const handlers = usePan({
    onStart: () => {
      start.current = rect
    },
    onMove: (dx, dy) => {
      const r = { ...start.current }
      const du = dx / full.width
      const dv = dy / full.height
      if (lock) {
        // 비율 잠금: 맞은편 꼭짓점을 고정하고, 가로 · 세로 움직임의 평균으로 크기를 정한다(사진 밖으로는 못 나간다)
        const ax = handle.sx > 0 ? r.u0 : r.u1
        const ay = handle.sy > 0 ? r.v0 : r.v1
        const wx = ((handle.sx > 0 ? r.u1 : r.u0) + du - ax) * handle.sx
        const wy = ((handle.sy > 0 ? r.v1 : r.v0) + dv - ay) * handle.sy * lock
        const maxW = Math.min(handle.sx > 0 ? 1 - ax : ax, (handle.sy > 0 ? 1 - ay : ay) * lock)
        // 자유 영역에서 작게 자른 뒤 고정 비율로 바꿔도 시작 크기가 강제로 커지지 않게 한다.
        const minWidth = Math.min(maxW, FREE_SELECTION_MIN * Math.min(1, lock), r.u1 - r.u0)
        const width = clamp((wx + wy) / 2, minWidth, maxW)
        const height = width / lock
        const u0 = handle.sx > 0 ? ax : ax - width
        const v0 = handle.sy > 0 ? ay : ay - height
        onChange({ u0, v0, u1: u0 + width, v1: v0 + height })
        return
      }
      // 자유 비율은 짧은 변을 강제로 늘리지 않는다. 긴 변으로 확대 한도를 지킨다.
      Object.assign(r, resizeFreeCrop(r, handle, du, dv, FREE_SELECTION_MIN))
      if (range) {
        // 비율 범위(테이프 조각 1~12배): 넘으면 지금 움직인 쪽 변을 범위 끝까지만
        const ratio = (r.u1 - r.u0) / (r.v1 - r.v0)
        const bound = ratio > range[1] ? range[1] : ratio < range[0] ? range[0] : null
        if (bound) {
          if (handle.sx) {
            const width = Math.min(1, (r.v1 - r.v0) * bound)
            if (handle.sx > 0) r.u1 = Math.min(1, r.u0 + width)
            else r.u0 = Math.max(0, r.u1 - width)
          } else {
            const height = Math.min(1, (r.u1 - r.u0) / bound)
            if (handle.sy > 0) r.v1 = Math.min(1, r.v0 + height)
            else r.v0 = Math.max(0, r.v1 - height)
          }
        }
      }
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
      {icon && <Icon name={icon} size={15} forText={12.5} />}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlay },
  card: { padding: 24, borderRadius: 16, backgroundColor: colors.surface, ...shadow.float },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  hint: { marginTop: 6, fontSize: 12.5, color: colors.textMuted },
  stage: {
    marginTop: 16,
    borderRadius: 12,
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
    minHeight: 48,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  // 테두리 2 = 좌우 여백 1 줄임(고를 때 칩 폭 · 옆 칩 자리가 움직이지 않게)
  chipActive: { borderWidth: 2, paddingHorizontal: 13, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
  chipText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  chipTextActive: { fontWeight: '800' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 },
  footerRight: { flexDirection: 'row', gap: 8 },
  // 적용: 이 창의 유일한 채움 버튼(링크 창의 적용과 같다)
  confirm: { borderColor: colors.primaryStrong, backgroundColor: colors.primaryStrong },
  confirmText: { color: colors.surface, fontWeight: '700' },
})
