import { memo, useEffect, useRef, useState } from 'react'
import { Animated, Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import CoverPattern from './CoverPattern'
import FillSvg from './FillSvg'
import Icon from '../../editor/components/controls/Icon'
import { useMediaUri } from '../../editor/hooks/useMediaUri'
import { usePan } from '../../editor/hooks/usePan'
import { stickerSource } from '../../editor/stickerAssets'
import { clamp, normalizeAngle, rotateVector } from '../../editor/utils/common'
import { ROTATE_OFFSET } from '../../editor/utils/popoverPlacement'
import { textStyle } from '../../editor/utils/text'
import { STICKER_SIZE, bandAutoColor, coverTitle, createStickerCopy, gradientStops, mix } from '../utils/coverDesign'
import { colors } from '../../shared/theme'

// 글씨체마다 같은 크기에서 보이는 글자 높이가 달라 손글씨는 조금 키운다.
const FONT_SCALE = { 'nanum-pen': 1.35, 'poor-story': 1.1 }
// 표지 요소 크기는 짧은 변 200 기준의 값이다. (목업과 같은 단위)
const BASE = 200

let nextGradientId = 0

/**
 * 고무줄 밴드. 로디아 · 몰스킨 하드커버 노트의 고무줄처럼 광택 없이 평평한 띠다.
 * 둘레(긴 변 · 위아래 끝)에 아주 얇은 어두운 선을 두고, 표지에서 살짝 떠 있도록 한쪽(세로는 오른쪽, 가로는 아래)에 옅은 그림자를 둔다.
 */
function ElasticBand({ vertical, color, scale, radius, style, lit = null }) {
  const edge = mix(color, '#1C2233', 0.24)
  const line = Math.max(0.5, 0.6 * scale)
  const shadow = Math.max(1, 1.4 * scale)
  return <View pointerEvents="none" style={[styles.band, style]}>
    <View style={[StyleSheet.absoluteFill, styles.bandShadow, { borderRadius: radius }, vertical ? { left: shadow, right: -shadow } : { top: shadow, bottom: -shadow }]} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: color, borderColor: edge, borderRadius: radius, borderWidth: line }]} />
    {lit && <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>{lit}</View>}
  </View>
}
function GradientFill({ stops }) {
  const id = useRef(`dio-cover-gradient-${(nextGradientId += 1)}`).current
  return <FillSvg>{(width, height) => <>
    <Defs><LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      {stops.map((color, i) => <Stop key={i} offset={i / (stops.length - 1)} stopColor={color} />)}
    </LinearGradient></Defs>
    <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
  </>}</FillSvg>
}

function OwnPhoto({ photo }) {
  const uri = useMediaUri(photo)
  return uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null
}

function StickerImage({ item }) {
  const uri = useMediaUri(item.asset ? null : item, { still: true })
  const source = stickerSource(item, true, uri)
  return source ? <Image source={source} style={styles.stickerImage} resizeMode="contain" /> : null
}

/**
 * 끄는 중인 스티커 값 { x, y, size, rotation }. 끄는 동안은 그 스티커(그림 · 손잡이)만 다시 그리고,
 * 손을 떼면 표지에 한 번만 넘긴다. (움직일 때마다 표지를 바꾸면 작업대 전체가 다시 그려져 버벅였다)
 */
function createDraftStore() {
  const values = new Map(), listeners = new Map()
  return {
    get: id => values.get(id) ?? null,
    set(id, value) {
      if (value) values.set(id, value); else values.delete(id)
      listeners.get(id)?.forEach(listener => listener(value ?? null))
    },
    subscribe(id, listener) {
      if (!listeners.has(id)) listeners.set(id, new Set())
      listeners.get(id).add(listener)
      return () => { listeners.get(id)?.delete(listener) }
    },
  }
}
function useDraft(store, item) {
  const [draft, setDraft] = useState(() => store?.get(item.id) ?? null)
  useEffect(() => store?.subscribe(item.id, setDraft), [store, item.id])
  return draft ? { ...item, ...draft } : item
}

const stickerBox = (item, scale) => {
  const side = item.size * scale * 2
  return { left: `${item.x}%`, top: `${item.y}%`, width: side, height: side, marginLeft: -side / 2, marginTop: -side / 2, transform: [{ rotate: `${item.rotation ?? 0}deg` }] }
}

/** 표지 위 스티커 그림 (표지 둘레로 잘리는 층) */
const StickerView = memo(function StickerView({ item, scale, store }) {
  const shown = useDraft(store, item)
  return <View pointerEvents="none" style={[styles.sticker, stickerBox(shown, scale)]}><StickerImage item={item} /></View>
})

// 편집기 선택 테두리(SelectionOverlay)와 같은 손잡이 크기 · 자리
const HANDLE = 18
const MARGIN = 40 // 손잡이가 스티커 밖에 걸쳐도 터치를 받도록 넓힌 둘레
const ROTATE_SNAP_DEG = 4.5
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
const BAR = { width: 92, height: 40 }

/** 손잡이 하나: 누른 자리를 기억하고 이동량으로 값을 바꾼다 */
function StickerHandle({ onStart, onMove, onEnd, label, style, children }) {
  const handlers = usePan({ onStart, onMove, onEnd: ({ cancelled }) => onEnd(cancelled) })
  return <View {...handlers} accessibilityLabel={label} hitSlop={10} style={style}>{children}</View>
}

/**
 * 표지 위 스티커 조작. 편집기 캔버스와 같은 손놀림이다:
 * 누르면 고르고 바로 끌어 옮긴다. 고르면 테두리 · 네 모서리(맞은편 모서리를 고정한 크기 조절) · 위쪽 회전 손잡이(0 · 90 · 180 · 270° 에서 걸림)가 보이고,
 * 스티커 아래(자리가 없으면 위)에 복제 · 삭제 바가 뜬다. 옮기거나 돌리는 동안은 바를 숨긴다.
 */
function StickerControl({ item, scale, width, height, selected, store, onSelect, onCommit, onRemove, onDuplicate }) {
  const shown = useDraft(store, item)
  const [busy, setBusy] = useState(false)
  const gesture = useRef(null)
  const center = value => ({ x: value.x / 100 * width, y: value.y / 100 * height })
  const begin = () => {
    const c = center(item)
    gesture.current = { start: item, c, side: item.size * scale * 2, moved: false }
    setBusy(true)
  }
  const update = patch => { gesture.current.moved = true; gesture.current.draft = patch; store.set(item.id, patch) }
  const finish = cancelled => {
    const g = gesture.current
    gesture.current = null
    setBusy(false)
    if (g?.moved && !cancelled) onCommit({ ...item, ...g.draft })
    store.set(item.id, null)
  }
  const move = {
    onStart: () => { onSelect(item.id); begin() },
    onMove: (dx, dy) => {
      const g = gesture.current
      if (!g || (!g.moved && Math.hypot(dx, dy) < 3)) return
      update({ x: clamp(g.start.x + dx / width * 100, 0, 100), y: clamp(g.start.y + dy / height * 100, 0, 100) })
    },
    onEnd: ({ cancelled }) => finish(cancelled),
  }
  const moveHandlers = usePan(move)
  // 모서리: 맞은편 모서리를 고정하고 대각선 방향으로 늘이고 줄인다 (편집기 resizePatch 와 같은 계산)
  const resize = (sx, sy) => ({
    onStart: begin,
    onMove: (dx, dy) => {
      const g = gesture.current
      if (!g) return
      const angle = g.start.rotation ?? 0
      const half = rotateVector(sx * g.side / 2, sy * g.side / 2, angle)
      const anchor = { x: g.c.x - half.x, y: g.c.y - half.y }
      const q = rotateVector(g.c.x + half.x + dx - anchor.x, g.c.y + half.y + dy - anchor.y, -angle)
      const size = clamp((q.x * sx + q.y * sy) / 2 / (2 * scale), STICKER_SIZE.min, STICKER_SIZE.max)
      const offset = rotateVector(sx * size * scale, sy * size * scale, angle)
      update({ size, x: clamp((anchor.x + offset.x) / width * 100, 0, 100), y: clamp((anchor.y + offset.y) / height * 100, 0, 100) })
    },
    onEnd: finish,
  })
  const rotate = {
    onStart: begin,
    onMove: (dx, dy) => {
      const g = gesture.current
      if (!g) return
      const tip = rotateVector(0, -(g.side / 2 + ROTATE_OFFSET), g.start.rotation ?? 0)
      const raw = Math.atan2(tip.y + dy, tip.x + dx) * 180 / Math.PI + 90
      const snapped = Math.round(raw / 90) * 90
      update({ rotation: normalizeAngle(Math.abs(snapped - raw) <= ROTATE_SNAP_DEG ? snapped : raw) })
    },
    onEnd: finish,
  }
  const side = shown.size * scale * 2
  const c = center(shown)
  const box = { position: 'absolute', left: c.x - side / 2 - MARGIN, top: c.y - side / 2 - MARGIN, width: side + MARGIN * 2, height: side + MARGIN * 2, transform: [{ rotate: `${shown.rotation ?? 0}deg` }] }
  // 바는 돌린 스티커를 감싸는 상자 아래에 둔다. 아래에 자리가 없으면 회전 손잡이 위로 올린다.
  const r = (shown.rotation ?? 0) * Math.PI / 180
  const extent = side / 2 * (Math.abs(Math.cos(r)) + Math.abs(Math.sin(r)))
  const below = c.y + extent + 10
  const barTop = below + BAR.height <= height ? below : c.y - extent - ROTATE_OFFSET - HANDLE / 2 - 8 - BAR.height
  const bar = { left: clamp(c.x - BAR.width / 2, 0, Math.max(0, width - BAR.width)), top: clamp(barTop, 0, Math.max(0, height - BAR.height)) }
  return <>
    <View pointerEvents="box-none" style={box}>
      <View accessibilityRole="adjustable" accessibilityLabel={`표지 스티커 ${item.name ?? ''}`} {...moveHandlers}
        style={[styles.stickerHit, { left: MARGIN, top: MARGIN, width: side, height: side }, Platform.OS === 'web' && { cursor: 'move' }]} />
      {selected && <>
        <View pointerEvents="none" style={[styles.stickerFrame, { left: MARGIN - 1.5, top: MARGIN - 1.5, width: side + 3, height: side + 3 }]} />
        <View pointerEvents="none" style={[styles.rotateStem, { left: MARGIN + side / 2 - 0.75, top: MARGIN - ROTATE_OFFSET }]} />
        <StickerHandle label="표지 스티커 회전 손잡이" {...rotate}
          style={[styles.handle, styles.rotateHandle, { left: MARGIN + side / 2 - HANDLE / 2, top: MARGIN - ROTATE_OFFSET - HANDLE / 2 }]}>
          <View pointerEvents="none"><Icon name="rotate" size={11} strokeWidth={2.6} color={colors.surface} /></View>
        </StickerHandle>
        {CORNERS.map(([sx, sy]) => <StickerHandle key={`${sx}${sy}`} label="표지 스티커 크기 조절" {...resize(sx, sy)}
          style={[styles.handle, styles.cornerHandle, { left: MARGIN + (sx + 1) / 2 * side - HANDLE / 2, top: MARGIN + (sy + 1) / 2 * side - HANDLE / 2 }]} />)}
      </>}
    </View>
    {selected && !busy && <View style={[styles.stickerBar, bar]}>
      <Pressable accessibilityRole="button" accessibilityLabel="표지 스티커 복제" onPress={() => onDuplicate(item)} style={({ pressed }) => [styles.barButton, pressed && styles.barPressed]}>
        <Icon name="duplicate" size={18} color={colors.text} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="표지 스티커 삭제" onPress={() => onRemove(item.id)} style={({ pressed }) => [styles.barButton, pressed && styles.barPressed]}>
        <Icon name="trash" size={18} color={colors.danger} />
      </Pressable>
    </View>}
  </>
}

/**
 * 제목 라벨. 편집 중에는 끌어 옮긴다(띠지는 위아래로만). 끄는 동안만 점선으로 표시하고 손을 떼면 지운다.
 * 목록 카드(이미 버튼) 안에서는 View 로만 그린다.
 * 옮긴 자리는 title.at = 라벨 왼쪽 위 { x, y } (표지 폭 · 높이의 %) 로 남고, 위치 9칸을 고르면 지운다.
 * origin: 라벨을 감싼 칸의 표지 안 자리 (처음 끌 때 지금 보이는 자리에서 시작한다)
 */
function TitleBox({ edit, ribbon, width, height, at, origin, onSelect, onMove, style, children }) {
  const [dragging, setDragging] = useState(false)
  const box = useRef({ x: 0, y: 0, width: 0, height: 0 })
  const latest = useRef(null)
  latest.current = { width, height, at, ribbon, origin, onSelect, onMove, setDragging }
  const start = useRef(null)
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      const { width: w, height: h, at: from, origin: outer } = latest.current
      start.current = from ?? { x: (outer.current.x + box.current.x) / w * 100, y: (outer.current.y + box.current.y) / h * 100 }
      latest.current.onSelect()
      latest.current.setDragging(true)
    },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dx) + Math.abs(g.dy) < 3) return
      const { width: w, height: h, ribbon: band } = latest.current
      const maxX = Math.max(0, 100 - box.current.width / w * 100), maxY = Math.max(0, 100 - box.current.height / h * 100)
      latest.current.onMove({ x: band ? 0 : Math.max(0, Math.min(maxX, start.current.x + g.dx / w * 100)), y: Math.max(0, Math.min(maxY, start.current.y + g.dy / h * 100)) })
    },
    onPanResponderRelease: () => latest.current.setDragging(false),
    onPanResponderTerminate: () => latest.current.setDragging(false),
    onPanResponderTerminationRequest: () => false,
  })).current
  if (!edit) return <View style={style}>{children}</View>
  return <View accessibilityRole="adjustable" accessibilityLabel="표지 제목 라벨 옮기기" style={[style, dragging && styles.titleSelected]} {...pan.panHandlers}
    onLayout={event => { box.current = event.nativeEvent.layout }}>
    {children}
  </View>
}

const luminance = hex => { const v = parseInt(hex.slice(1), 16); return (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255 }

/**
 * 책상 빛을 받는 표지 층(코덱스 표지 조명 설계). 표지 본체(둥근 모서리로 잘림) 안에만 들어가고 글자 · 고무줄 · 스티커 · 버튼에는 얹히지 않는다.
 * 흰 밝기(screen) + 시간대 색(soft-light) + 그늘 쪽 차가운 곱하기, 빛이 오는 쪽 가장자리의 얇은 빛띠, 반대쪽의 얇은 어두운 선.
 */
function CoverLightReceiver({ light, scale, windowed }) {
  const edge = Math.max(0.6, 1 * scale)
  const side = light.keySide
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {!windowed && <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: light.screen.color, opacity: light.screen.opacity, mixBlendMode: 'screen' }]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: light.tint.color, opacity: light.tint.opacity, mixBlendMode: 'soft-light' }]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: light.shade.color, opacity: light.shade.opacity, mixBlendMode: 'multiply' }]} />
    </>}
    {side && <>
      <View style={{ position: 'absolute', top: 0, bottom: 0, width: edge, [side]: 0, backgroundColor: '#FFF4E3', opacity: light.edge, mixBlendMode: 'screen' }} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, width: edge, [side === 'left' ? 'right' : 'left']: 0, backgroundColor: 'rgb(36,43,62)', opacity: light.farEdge, mixBlendMode: 'multiply' }} />
    </>}
  </View>
}

// 표지가 받는 책상 빛(코덱스 표지 명암 설계): 표지 전체에 시간대 그늘(곱하기)을 깔고, 창빛 마스크 안만 그 그늘을 되돌려 본래 색에 가깝게 밝힌다.
// 마스크 밖 · 창살(+) 자리는 그늘 그대로라 책상처럼 받는 쪽 / 안 받는 쪽이 갈린다. 사진 표지는 곱하기만으로는 묻혀서 soft-light 그늘과 더 센 되돌림을 쓴다.
// 행: [시각, 색, 불투명도] (0 ~ 23 시, 24 는 0 시와 같다)
const SHADE = [
  [0, '#423D52', 0.165],
  [6.5, '#617187', 0.1],
  [8, '#718096', 0.125],
  [10, '#77869A', 0.135],
  [12, '#788596', 0.145],
  [15, '#897567', 0.145],
  [17.5, '#8B6D63', 0.15],
  [19, '#685A68', 0.155],
  [20, '#4B5068', 0.17],
  [21, '#4A4050', 0.185],
  [23, '#443846', 0.205],
  [24, '#423D52', 0.165],
]
const SHADE_PHOTO = [
  [0, '#403549', 0.185],
  [6.5, '#52687F', 0.12],
  [8, '#647C94', 0.15],
  [10, '#6B8095', 0.165],
  [12, '#6D7E91', 0.175],
  [15, '#826D61', 0.175],
  [17.5, '#805F59', 0.18],
  [19, '#615064', 0.18],
  [20, '#434963', 0.2],
  [21, '#453746', 0.22],
  [23, '#3E303D', 0.235],
  [24, '#403549', 0.185],
]
const SHADE_SOFT_PHOTO = [
  [0, '#4C3553', 0.07],
  [6.5, '#6687A5', 0.04],
  [8, '#7691A8', 0.055],
  [10, '#7A91A6', 0.06],
  [12, '#7D8DA0', 0.065],
  [15, '#967766', 0.065],
  [17.5, '#956B61', 0.07],
  [19, '#74566D', 0.065],
  [20, '#50546F', 0.07],
  [21, '#593C49', 0.085],
  [23, '#512F40', 0.095],
  [24, '#4C3553', 0.07],
]
const RESTORE_SCREEN = [
  [0, '#FFE6B8', 0.085],
  [6.5, '#EAF4FF', 0.055],
  [8, '#FFF3DF', 0.08],
  [10, '#FFF1D5', 0.09],
  [12, '#FFF0D2', 0.1],
  [15, '#FFE6C8', 0.1],
  [17.5, '#FFDDBE', 0.105],
  [19, '#F1D6CD', 0.095],
  [20, '#DCE5FF', 0.085],
  [21, '#FFD89A', 0.14],
  [23, '#FFD08A', 0.165],
  [24, '#FFE6B8', 0.085],
]
const RESTORE_SCREEN_PHOTO = [
  [0, '#FFE1AF', 0.11],
  [6.5, '#E5F2FF', 0.07],
  [8, '#FFF0D7', 0.1],
  [10, '#FFECD0', 0.115],
  [12, '#FFE9C7', 0.125],
  [15, '#FFDFC0', 0.125],
  [17.5, '#FFD4B2', 0.13],
  [19, '#EBC7C5', 0.115],
  [20, '#D8E2FF', 0.105],
  [21, '#FFD187', 0.175],
  [23, '#FFC071', 0.205],
  [24, '#FFE1AF', 0.11],
]
const RESTORE_SOFT = [
  [0, '#EFC590', 0.075],
  [6.5, '#B8D6F2', 0.045],
  [8, '#FFE0B7', 0.065],
  [10, '#FFD7A6', 0.075],
  [12, '#FFD29B', 0.085],
  [15, '#FFC38D', 0.085],
  [17.5, '#EEAD8D', 0.09],
  [19, '#C69AAF', 0.075],
  [20, '#9EABD3', 0.06],
  [21, '#E9A464', 0.115],
  [23, '#D9905A', 0.135],
  [24, '#EFC590', 0.075],
]
const RESTORE_SOFT_PHOTO = [
  [0, '#E9B678', 0.11],
  [6.5, '#A9D0F3', 0.065],
  [8, '#FFD19B', 0.095],
  [10, '#FFC98E', 0.11],
  [12, '#FFC184', 0.12],
  [15, '#FFB377', 0.12],
  [17.5, '#E99B7F', 0.125],
  [19, '#BC8DA8', 0.105],
  [20, '#97A8D2', 0.09],
  [21, '#E2944E', 0.145],
  [23, '#CA703D', 0.165],
  [24, '#E9B678', 0.11],
]
const LAMP = { screen: [['#FFD58A', 0.075], ['#FFC978', 0.105]], soft: [['#EAA058', 0.07], ['#CD7B48', 0.09]] } // 21시 · 23시
const LAMP_PHOTO = { screen: [['#FFCD75', 0.105], ['#FFB85D', 0.135]], soft: [['#DF813C', 0.095], ['#BC6032', 0.12]] } // 21시 · 23시
// 가로등 층: 21시 · 23시 값 사이를 이어 쓰고 그 뒤는 23시 값을 쓴다
const WINDOW_LIGHT = require('../../../assets/desk/window-light.png')
const mixNum = (a, b, t) => a + (b - a) * t
const mixColor = (a, b, t) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16); const c = shift => Math.round(mixNum((A >> shift) & 255, (B >> shift) & 255, t)).toString(16).padStart(2, '0'); return `#${c(16)}${c(8)}${c(0)}` }
function rowAt(table, hour) {
  const next = table.findIndex(row => row[0] > hour)
  const to = table[next < 0 ? table.length - 1 : next], from = table[next < 0 ? table.length - 1 : Math.max(0, next - 1)]
  const t = to[0] === from[0] ? 0 : (hour - from[0]) / (to[0] - from[0])
  return { color: mixColor(from[1], to[1], t), opacity: mixNum(from[2], to[2], t) }
}
// 코덱스 표의 되돌림 값을 태블릿에서 실측하니 어두운 표지의 받는 쪽 / 안 받는 쪽 밝기 차가 목표(약 17%)의 절반(약 7%)이라 되돌림에 곱하는 보정이다(클로드 보정값).
// 합친 상한은 코덱스 safety_caps(밝힘 screen 0.27 · 사진 0.34, soft-light 0.225 · 0.285)를 넘지 않는다.
const RESTORE_GAIN = 1.6
const CAP = { solid: { screen: 0.27, soft: 0.225 }, photo: { screen: 0.34, soft: 0.285 } }
const lampAt = (pair, hour) => { const t = Math.max(0, Math.min(1, ((hour < 5 ? hour + 24 : hour) - 21) / 2)); return { color: mixColor(pair[0][0], pair[1][0], t), opacity: mixNum(pair[0][1], pair[1][1], t) } }

/**
 * 책상과 같은 창빛 마스크를 표지 위에 같은 자리에 비춘다(순서: 전체 그늘 → 마스크 안 되돌림 → 가로등).
 * mask 는 표지 상자 기준 마스크 자리(Cover 가 책상과 맞춰 계산), origin 은 이 층의 왼쪽 위가 표지 상자의 어디인지, photo 는 사진 표지 여부다.
 */
function CoverWindowLight({ mask, originX, originY, boxWidth, boxHeight, photo = false }) {
  const { lit } = mask
  // 마스크는 화면 px 로 놓고(표지 상자 왼쪽 위가 기준), 카드가 커지고 줄어든 만큼(inverse)만 되돌려 크기를 맞춘다. 자리는 카드 이동에 맞춰 애니메이션 값이 옮긴다.
  const layer = (key, frame, opacity, tint, blend) => opacity > 0.001 && <Animated.Image key={key} source={WINDOW_LIGHT} resizeMode="stretch"
    style={{ position: 'absolute', left: 0, top: 0, width: frame.width, height: frame.height, opacity, tintColor: tint, mixBlendMode: blend,
      transform: [{ translateX: frame.offset.x }, { translateY: frame.offset.y }, ...frame.transform] }} />
  const hour = lit.hour
  const shade = rowAt(photo ? SHADE_PHOTO : SHADE, hour)
  const softShade = photo ? rowAt(SHADE_SOFT_PHOTO, hour) : null
  const lampWeight = Math.max(0, Math.min(1, lit.lampOpacity / 0.3))
  const sunWeight = Math.min(1, lit.sun)
  // 낮에는 해 마스크 자리, 밤에는 가로등 마스크 자리. 둘 다 없는 때(잔광이 끝난 20시 무렵)에는 되돌림 없이 그늘만 남는다.
  const useLamp = lampWeight > sunWeight
  const frame = useLamp ? mask.lamp : mask.sun
  const weight = Math.max(sunWeight, lampWeight)
  const screen = rowAt(photo ? RESTORE_SCREEN_PHOTO : RESTORE_SCREEN, hour)
  const soft = rowAt(photo ? RESTORE_SOFT_PHOTO : RESTORE_SOFT, hour)
  const lampSet = photo ? LAMP_PHOTO : LAMP
  const lampScreen = lampAt(lampSet.screen, hour), lampSoft = lampAt(lampSet.soft, hour)
  const cap = photo ? CAP.photo : CAP.solid
  const restoreScreen = screen.opacity * weight * RESTORE_GAIN, restoreSoft = soft.opacity * weight * RESTORE_GAIN
  const lampScreenRaw = lampScreen.opacity * lampWeight * RESTORE_GAIN, lampSoftRaw = lampSoft.opacity * lampWeight * RESTORE_GAIN
  // 합친 밝힘이 상한을 넘으면 같은 비율로 줄인다
  const screenScale = Math.min(1, cap.screen / Math.max(0.001, restoreScreen + lampScreenRaw))
  const softScale = Math.min(1, cap.soft / Math.max(0.001, restoreSoft + lampSoftRaw))
  const screenOpacity = restoreScreen * screenScale, softOpacity = restoreSoft * softScale
  const lampScreenOpacity = lampScreenRaw * screenScale, lampSoftOpacity = lampSoftRaw * softScale
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <View style={[StyleSheet.absoluteFill, { backgroundColor: shade.color, opacity: shade.opacity, mixBlendMode: 'multiply' }]} />
    {softShade && <View style={[StyleSheet.absoluteFill, { backgroundColor: softShade.color, opacity: softShade.opacity, mixBlendMode: 'soft-light' }]} />}
    <Animated.View style={{ position: 'absolute', left: -originX, top: -originY, width: boxWidth, height: boxHeight, transformOrigin: 'left top', transform: [{ scale: mask.inverse }] }}>
      {weight > 0.001 && <>
        {layer('screen', frame, screenOpacity, screen.color, 'screen')}
        {layer('soft', frame, softOpacity, soft.color, 'soft-light')}
      </>}
      {lampWeight > 0.001 && <>
        {layer('lampScreen', mask.lamp, lampScreenOpacity, lampScreen.color, 'screen')}
        {layer('lampSoft', mask.lamp, lampSoftOpacity, lampSoft.color, 'soft-light')}
      </>}
    </Animated.View>
  </View>
}

/** 라벨 종이판이 책상 빛에 아주 살짝 반응한다(저녁엔 따뜻하게, 그늘에선 차갑게). 글자 아래에 깔리고 글자 색은 바꾸지 않는다. */
function PaperLightResponse({ light }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: light.paper.color, opacity: light.paper.opacity }]} />
}

/**
 * 광택 있는 어두운 표지에 비치는 창 모양 반사(screen). 빛이 오는 쪽을 따라 아침엔 왼쪽, 저녁엔 오른쪽에 길게 누운 막대와 얇은 문살 두 줄이 있다.
 * 밤에는 가로등의 작은 따뜻한 반짝임만 남는다. 밝은 무광 표지에는 쓰지 않는다.
 */
function CoverGloss({ light }) {
  if (light.gloss < 0.004) return null
  const lamp = light.glossLamp
  const shape = lamp ? { left: '58%', top: '16%', width: '22%', height: '5%', rotate: '-18deg', color: '#FFE5AB' }
    : light.glossPhase === 'morning' ? { left: '5%', top: '18%', width: '46%', height: '7%', rotate: '18deg', color: '#FFF8EB' }
    : light.glossPhase === 'noon' ? { left: '27%', top: '18%', width: '46%', height: '7%', rotate: '3deg', color: '#FFF8EB' }
    : { left: '49%', top: '18%', width: '46%', height: '7%', rotate: '-18deg', color: '#FFF8EB' }
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { mixBlendMode: 'screen', opacity: light.gloss }]}>
    <View style={{ position: 'absolute', left: shape.left, top: shape.top, width: shape.width, height: shape.height, transform: [{ rotate: shape.rotate }], overflow: 'hidden', borderRadius: 4 }}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs><LinearGradient id="gloss" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={shape.color} stopOpacity={0} />
          <Stop offset="0.5" stopColor={shape.color} stopOpacity={1} />
          <Stop offset="1" stopColor={shape.color} stopOpacity={0} />
        </LinearGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#gloss)" />
      </Svg>
      {!lamp && <>
        <View style={{ position: 'absolute', left: '13%', top: 0, bottom: 0, width: 1, backgroundColor: '#FFFFFF', opacity: 0.2 }} />
        <View style={{ position: 'absolute', left: '66%', top: 0, bottom: 0, width: 1, backgroundColor: '#FFFFFF', opacity: 0.2 }} />
      </>}
    </View>
  </View>
}

/**
 * 표지 그림. width · height 를 알면 그 크기로, height 가 없으면 부모를 채우고 width 로만 글자 크기를 맞춘다.
 * edit 를 넘기면 표지 위 제목 라벨과 스티커를 끌어 옮길 수 있다.
 */
function CoverArt({ cover, name, width, height, edit = null, shadow = null, light = null, windowMask = null }) {
  const [selected, setSelected] = useState(null)
  const titleOrigin = useRef({ x: 0, y: 0 })
  const drafts = useRef(null)
  if (!drafts.current) drafts.current = createDraftStore()
  const scale = Math.min(width, height ?? width) / BASE
  if (!cover.enabled) return <View style={[styles.none, { borderRadius: 6 * scale }]}>
    <Text style={styles.noneTitle}>표지 없음</Text>
  </View>
  const title = coverTitle(cover, name)
  const { anchor } = cover.title
  const vertical = anchor[0], horizontal = anchor[1]
  const centered = horizontal === 'c'
  const ribbon = cover.plate === 'ribbon'
  const align = centered ? 'center' : horizontal === 'l' ? 'flex-start' : 'flex-end'
  // 띠지는 표지 폭 전체를 감싸는 종이 밴드다. 위치 9칸의 줄은 띠지 높이를, 칸은 띠지 안 글 정렬을 정한다.
  // (아래 줄은 하드커버 노트 띠지처럼 표지 아래쪽 55~80% 높이쯤에 놓인다)
  const at = cover.title.at
  const place = at
    ? { top: `${at.y}%`, ...(ribbon ? { left: 0, right: 0 } : { left: `${at.x}%` }) }
    : ribbon
    ? { left: 0, right: 0, ...(vertical === 't' ? { top: '12%' } : vertical === 'b' ? { bottom: '19%' } : { top: 0, bottom: 0, justifyContent: 'center' }) }
    : { left: '11%', right: cover.band.on && cover.band.dir === 'v' && cover.band.pos === 'near' ? '22%' : '11%', alignItems: align, ...(vertical === 't' ? { top: '11%' } : vertical === 'b' ? { bottom: '11%' } : { top: 0, bottom: 0, justifyContent: 'center' }) }
  const textAlign = centered ? 'center' : horizontal === 'l' ? 'left' : 'right'
  const hasSubtitle = cover.subtitle.on && cover.subtitle.text
  // 띠지는 소제목이 없으면 위아래를 조금 더 띄워 제목 한 줄만으로도 띠 모양이 살게 한다
  const plate = cover.plate === 'paper' ? [styles.paperPlate, { borderRadius: 4 * scale, paddingHorizontal: 12 * scale, paddingVertical: 10 * scale }]
    : ribbon ? [styles.ribbonPlate, { backgroundColor: cover.ribbon?.color ?? '#F3F2ED', alignItems: align, paddingHorizontal: '22%', paddingVertical: (hasSubtitle ? 15 : 19) * scale }] : null
  // 띠지 안 제목과 소제목 사이의 짧은 가로선 (둘 다 있을 때만)
  const rule = ribbon && !!title && !!hasSubtitle && <View style={[styles.rule, { height: Math.max(0.75, 0.9 * scale), marginVertical: 5 * scale, backgroundColor: cover.title.color }]} />
  // 띠지 위아래 가장자리 안쪽의 가는 인쇄선 두 줄 (책 띠지의 테두리선). 제목 색을 옅게 쓴다.
  const hairline = Math.max(0.5, 0.6 * scale)
  const ribbonEdges = ribbon && <>
    <View pointerEvents="none" style={[styles.ribbonEdge, { top: 4 * scale, height: hairline, backgroundColor: cover.title.color }]} />
    <View pointerEvents="none" style={[styles.ribbonEdge, { bottom: 4 * scale, height: hairline, backgroundColor: cover.title.color }]} />
  </>
  const titleFont = textStyle({ font: cover.title.font, fontSize: cover.title.size * (FONT_SCALE[cover.title.font] ?? 1), color: cover.title.color, bold: true, lineSpacing: 1.15 }, scale, Platform.OS)
  const bandWidth = Math.max(4.5, 9 * scale)
  // 실제 고무줄처럼 표지 위아래(가로 띠는 좌우) 가장자리 밖으로 살짝 튀어나온다
  const bandOut = Math.max(0.75, 1.25 * scale)
  // 표지 본체 크기. 고무줄을 켜고 끄거나 방향을 바꿔도 표지 크기가 달라지지 않게 늘 네 변을 bandOut 만큼 줄인다.
  const bodyWidth = width - bandOut * 2, bodyHeight = (height ?? width) - bandOut * 2
  // 'auto' 는 표지 색을 같은 계열로 조금 어둡게 한 고무줄 (사진 표지는 따를 바탕색이 없어 기본 남색)
  const stops = gradientStops(cover)
  const bandColor = cover.band.color !== 'auto' ? cover.band.color : bandAutoColor(cover)
  // 고무줄은 표지 본체 밖으로 나온 별개 층이라 책상 빛을 따로 받는다. 표지 상자 기준 왼쪽 위 자리를 구해 같은 마스크를 맞춘다.
  const boxH = height ?? width
  const bandLeft = cover.band.dir === 'v' ? (cover.band.pos === 'center' ? width / 2 - bandWidth / 2 : width * 0.85 - bandWidth) : 0
  const bandTop = cover.band.dir === 'v' ? 0 : (cover.band.pos === 'center' ? boxH / 2 - bandWidth / 2 : boxH * 0.86 - bandWidth)
  const band = cover.band.on && (cover.band.dir === 'v'
    ? { top: 0, bottom: 0, width: bandWidth, ...(cover.band.pos === 'center' ? { left: '50%', marginLeft: -bandWidth / 2 } : { right: '15%' }) }
    : { left: 0, right: 0, height: bandWidth, ...(cover.band.pos === 'center' ? { top: '50%', marginTop: -bandWidth / 2 } : { bottom: '14%' }) })
  const titleArea = (title || hasSubtitle) ? <View pointerEvents="box-none" style={[styles.titleBox, place]}
    onLayout={event => { titleOrigin.current = event.nativeEvent.layout }}>
    <TitleBox edit={edit} ribbon={ribbon} width={bodyWidth} height={bodyHeight} at={at} origin={titleOrigin}
      onSelect={() => select(null)} onMove={next => edit.onChange({ ...cover, title: { ...cover.title, at: next } })}
      style={[plate, !ribbon && { maxWidth: at ? bodyWidth * 0.78 : centered ? '100%' : '78%' }]}>
      {light && plate && <PaperLightResponse light={light} />}
      {ribbonEdges}
      {title ? <Text numberOfLines={3} lineBreakStrategyIOS="hangul-word" style={[titleFont, styles.fill, styles.keepWords, { textAlign }]}>{title}</Text> : null}
      {rule}
      {hasSubtitle ? <Text numberOfLines={1} style={[styles.subtitle, ribbon && styles.fill, { textAlign, color: cover.subtitle.color, fontSize: Math.max(5, cover.subtitle.size * scale), letterSpacing: cover.subtitle.size * scale * 0.12, marginTop: ribbon ? 0 : 4 * scale }]}>{cover.subtitle.text}</Text> : null}
    </TitleBox>
  </View> : null
  const select = id => { setSelected(id); edit?.onSelectSticker?.(id) }
  const changeSticker = next => edit.onChange({ ...cover, stickers: cover.stickers.map(item => item.id === next.id ? next : item) })
  const removeSticker = id => { select(null); edit.onChange({ ...cover, stickers: cover.stickers.filter(item => item.id !== id) }) }
  const duplicateSticker = item => {
    const copy = createStickerCopy(item)
    edit.onChange({ ...cover, stickers: [...cover.stickers, copy] })
    select(copy.id)
  }
  const corners = { borderTopLeftRadius: 6 * scale, borderBottomLeftRadius: 6 * scale, borderTopRightRadius: 14 * scale, borderBottomRightRadius: 14 * scale }
  // 표지 본체는 고무줄이 튀어나올 만큼 안쪽으로 줄여 둥근 모서리로 자르고, 고무줄은 이 영역 끝까지 그린다.
  // 튀어나온 끝이 영역 안에 있어 목록 · 스와이프 · 편집 어디서 부모가 잘라도 똑같이 보인다.
  // 띠지는 고무줄 아래(고무줄이 띠지 위로 지나감), 종이 라벨 · 판 없음과 스티커는 고무줄 위에 놓인다.
  // 고무줄을 끄거나 방향을 바꿔도 본체는 같은 자리 · 크기다. (예전에는 고무줄을 켠 방향으로만 줄여 높이가 달라 보였다)
  const body = { ...corners, top: bandOut, bottom: bandOut, left: bandOut, right: bandOut }
  const base = cover.kind === 'photo' ? '#C9CED8' : stops ? stops[0] : cover.color
  // 광택은 어두운 표지에만 비친다(밝은 무광 표지에는 창 반사가 없다)
  const glossy = cover.kind !== 'photo' && /^#[0-9a-f]{6}$/i.test(base) && luminance(base) < 0.35
  // 웹에서 스티커 · 라벨을 끄는 동안 제목 글자가 선택되지 않게
  return <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, edit && Platform.OS === 'web' && styles.noSelect]}>
  {/* 그림자는 잘라 그리는 본체에서는 iOS 에서 잘리므로 같은 자리에 따로 깐다 */}
  {shadow && <View pointerEvents="none" style={[styles.layer, body, { backgroundColor: base }, shadow]} />}
  <View style={[styles.layer, styles.clip, body, { backgroundColor: base }]}>
    {cover.kind === 'photo' ? (cover.photo?.src ? <OwnPhoto photo={cover.photo} />
      : <View style={styles.noPhoto}><Icon name="image" size={Math.max(18, 30 * scale)} color="#FFFFFF" /></View>)
      : <>{stops && <GradientFill stops={stops} />}<CoverPattern pattern={cover.pattern.type} tone={cover.pattern.tone} scale={scale} /></>}
    {edit && <Pressable accessibilityLabel="표지 스티커 선택 해제" onPress={() => select(null)} style={StyleSheet.absoluteFill} />}
    <View pointerEvents="none" style={[styles.spine, { width: '4.9%' }]} />
    {light && windowMask && <CoverWindowLight mask={windowMask} originX={bandOut} originY={bandOut} boxWidth={width} boxHeight={height ?? width} photo={cover.kind === 'photo'} />}
    {light && <CoverLightReceiver light={light} scale={scale} windowed={Boolean(windowMask)} />}
    {light && glossy && <CoverGloss light={light} />}
    {ribbon && titleArea}
  </View>
  {band && <ElasticBand vertical={cover.band.dir === 'v'} color={bandColor} scale={scale} radius={bandWidth * 0.3} style={band}
    lit={light && windowMask ? <CoverWindowLight mask={windowMask} originX={bandLeft} originY={bandTop} boxWidth={width} boxHeight={height ?? width} photo={cover.kind === 'photo'} /> : null} />}
  <View pointerEvents="box-none" style={[styles.layer, styles.clip, body]}>
    {!ribbon && titleArea}
    {cover.stickers.map(item => <StickerView key={item.id} item={item} scale={scale} store={drafts.current} />)}
  </View>
  {/* 스티커 조작 층: 손잡이 · 바가 표지 둘레에 잘리지 않게 자르지 않는 층에 따로 둔다 */}
  {edit && height ? <View pointerEvents="box-none" style={[styles.layer, body]}>
    {cover.stickers.map(item => <StickerControl key={item.id} item={item} scale={scale} width={bodyWidth} height={bodyHeight} selected={selected === item.id} store={drafts.current}
      onSelect={select} onCommit={changeSticker} onRemove={removeSticker} onDuplicate={duplicateSticker} />)}
  </View> : null}
  </View>
}

export default memo(CoverArt)

const styles = StyleSheet.create({
  layer: { position: 'absolute' },
  clip: { overflow: 'hidden' },
  fill: { alignSelf: 'stretch' },
  // 한글 제목은 낱말 가운데에서 끊지 않는다 (iOS 는 lineBreakStrategyIOS, 웹은 word-break)
  keepWords: Platform.OS === 'web' ? { wordBreak: 'keep-all' } : {},
  spine: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11,25,87,.16)' },
  band: { position: 'absolute' },
  bandShadow: { backgroundColor: 'rgba(0,0,0,.12)' },
  titleBox: { position: 'absolute' },
  paperPlate: { backgroundColor: 'rgba(245,244,239,.96)', shadowColor: colors.text, shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  // 종이 띠지. 색은 cover.ribbon.color (기본은 노란 기를 뺀 아이보리). 아래로 옅은 그림자를 둬 표지를 감싼 느낌을 낸다.
  ribbonPlate: { shadowColor: '#000000', shadowOpacity: 0.14, shadowRadius: 3, shadowOffset: { width: 0, height: 1.5 }, elevation: 2 },
  rule: { width: '28%', opacity: 0.6 },
  subtitle: { fontWeight: '800' },
  sticker: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  noPhoto: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  titleSelected: { borderWidth: 1.5, borderColor: colors.primaryStrong, borderStyle: 'dashed' },
  stickerImage: { width: '100%', height: '100%' },
  ribbonEdge: { position: 'absolute', left: 0, right: 0, opacity: 0.32 },
  noSelect: { userSelect: 'none' },
  // 편집기 선택 테두리(SelectionOverlay)와 같은 모양
  stickerHit: { position: 'absolute' },
  stickerFrame: { position: 'absolute', borderWidth: 1.5, borderColor: colors.primary },
  rotateStem: { position: 'absolute', width: 1.5, height: ROTATE_OFFSET - 1.5, backgroundColor: colors.primary },
  handle: { position: 'absolute', width: HANDLE, height: HANDLE, borderRadius: HANDLE / 2, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.text, shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  cornerHandle: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary },
  rotateHandle: { backgroundColor: colors.primaryStrong, borderWidth: 1, borderColor: colors.surface },
  stickerBar: { position: 'absolute', width: BAR.width, height: BAR.height, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 2, borderRadius: 12,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(110,146,198,0.2)', shadowColor: colors.text, shadowOpacity: 0.16, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  barButton: { width: 42, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  barPressed: { backgroundColor: colors.primarySoft },
  none: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: 'rgba(255,255,255,.7)' },
  noneTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
})
