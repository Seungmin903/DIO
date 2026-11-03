import { memo, useEffect, useRef, useState } from 'react'
import { Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { Image as CachedImage } from 'expo-image'
import CoverPattern from './CoverPattern'
import FillSvg from './FillSvg'
import Icon from '../../editor/components/controls/Icon'
import { useMediaEntry, useMediaUri } from '../../editor/hooks/useMediaUri'
import { mediaService } from '../../editor/services/mediaStore'
import { mediaId } from '../../editor/utils/mediaReferences.js'
import { usePan } from '../../editor/hooks/usePan'
import { builtinStickerOf } from '../../editor/builtinStickers'
import BuiltinStickerArt from '../../editor/components/canvas/BuiltinStickerArt'
import { stickerSource } from '../../editor/stickerAssets'
import { clamp, normalizeAngle, rotateVector } from '../../editor/utils/common'
import { ROTATE_OFFSET } from '../../editor/utils/popoverPlacement'
import { textStyle } from '../../editor/utils/text'
import { STICKER_SIZE, bandAutoColor, coverTitle, createStickerCopy, coverLineColor, gradientStops, mix } from '../utils/coverDesign'
import { colors } from '../../shared/theme'
import { coverLayout } from '../../editor/utils/objects'

// 글씨체마다 같은 크기에서 보이는 글자 높이가 달라 손글씨는 조금 키운다.
const FONT_SCALE = { 'nanum-pen': 1.35, 'poor-story': 1.1 }
// 표지 요소 크기는 짧은 변 200 기준의 값이다. (목업과 같은 단위)
const BASE = 200

let nextGradientId = 0

/** 표지 본체(고무줄이 튀어나올 만큼 안쪽으로 줄인 둥근 판)의 크기에 따른 값. 포커스 프레임(Cover)이 같은 값으로 본체를 감싼다. */
export function coverBody(width, height) {
  const scale = Math.min(width, height ?? width) / BASE
  return { scale, bandOut: Math.max(0.75, 1.25 * scale), left: 6 * scale, right: 14 * scale }
}

/**
 * 고무줄 밴드. 로디아 · 몰스킨 하드커버 노트의 고무줄처럼 광택 없이 평평한 띠다.
 * 둘레(긴 변 · 위아래 끝)에 아주 얇은 어두운 선을 두고, 표지에서 살짝 떠 있도록 한쪽(세로는 오른쪽, 가로는 아래)에 옅은 그림자를 둔다.
 */
function ElasticBand({ vertical, color, scale, radius, style }) {
  const edge = mix(color, '#1C2233', 0.24)
  const line = Math.max(0.5, 0.6 * scale)
  const shadow = Math.max(1, 1.4 * scale)
  return <View pointerEvents="none" style={[styles.band, style]}>
    <View style={[StyleSheet.absoluteFill, styles.bandShadow, { borderRadius: radius }, vertical ? { left: shadow, right: -shadow } : { top: shadow, bottom: -shadow }]} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: color, borderColor: edge, borderRadius: radius, borderWidth: line }]} />
  </View>
}
/**
 * 띠지: 질감 · 그림자 없는 단색 종이에 위아래 가장자리 조금 안쪽으로 가는 인쇄선(글자 색)을 긋는다(하드커버 노트 띠지 참고, 2026-11-01).
 * 두께는 짧은 변 200 기준(scale).
 */
function RibbonPaper({ ink, scale }) {
  const line = { height: Math.max(0.5, 0.55 * scale), backgroundColor: ink, opacity: 0.7 }
  const inset = 3 * scale
  return <>
    <View pointerEvents="none" style={[styles.ribbonEdge, line, { top: inset }]} />
    <View pointerEvents="none" style={[styles.ribbonEdge, line, { bottom: inset }]} />
  </>
}
function GradientFill({ stops, initialWidth, initialHeight }) {
  const id = useRef(`dio-cover-gradient-${(nextGradientId += 1)}`).current
  return <FillSvg initialWidth={initialWidth} initialHeight={initialHeight}>{(width, height) => <>
    <Defs><LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      {stops.map((color, i) => <Stop key={i} offset={i / (stops.length - 1)} stopColor={color} />)}
    </LinearGradient></Defs>
    <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
  </>}</FillSvg>
}

/**
 * 표지 겉면만(바탕색 · 그라데이션 · 무늬, 사진 표지는 사진). 제목 · 띠지 · 고무줄 · 스티커는 없다.
 * 펼쳐서 보기에서 종이 밖으로 보이는 표지 판에 쓴다. scale 은 닫힌 표지와 같은 단위(짧은 변 200 = 1)라 무늬 크기가 같다.
 */
export function CoverSurface({ cover, width, height, scale }) {
  const stops = cover.kind === 'photo' ? null : gradientStops(cover)
  const base = cover.kind === 'photo' ? cover.photo?.tone ?? '#C9CED8' : stops ? stops[0] : cover.color
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: base }]}>
    {cover.kind === 'photo' ? (cover.photo?.src ? <OwnPhoto photo={cover.photo} /> : null)
      : <>{stops && <GradientFill stops={stops} initialWidth={width} initialHeight={height} />}<CoverPattern pattern={cover.pattern.type} tone={cover.pattern.tone} scale={scale} line={coverLineColor(cover)} initialWidth={width} initialHeight={height} /></>}
  </View>
}

const PHOTO_RETRIES = 3

// 들어가자마자 사진이 안 뜨던 원인은 useMediaUri 가 React Compiler 에 기억된 옛 값을 돌려준 것이었다(useMediaUri 참고).
// 그와 별개로 보관소 읽기 실패와 그림 풀기 실패는 잠깐 뒤(0.5 · 1 · 1.5초) 다시 시도한다.
// 자른 자리(crop)가 있으면 표지 크기를 재서 그 자리대로 놓는다(없으면 가운데 기준으로 꽉 채움)
function OwnPhoto({ photo }) {
  const [box, setBox] = useState(null)
  if (photo.crop && photo.aspect) {
    const layout = box && coverLayout({ imageWidth: photo.aspect, imageHeight: 1, crop: photo.crop }, box.width, box.height)
    return <View style={[StyleSheet.absoluteFill, styles.photoClip]} onLayout={event => { const { width, height } = event.nativeEvent.layout; setBox(prev => (prev?.width === width && prev?.height === height ? prev : { width, height })); }}>
      {layout && <View style={{ position: 'absolute', left: layout.left, top: layout.top, width: layout.width, height: layout.height }}><PhotoImage photo={photo} /></View>}
    </View>
  }
  return <PhotoImage photo={photo} />
}

function PhotoImage({ photo }) {
  const uri = useMediaUri(photo)
  const id = mediaId(photo)
  const entry = useMediaEntry(id)
  const [attempt, setAttempt] = useState(0)
  const failed = entry?.status === 'error'
  useEffect(() => {
    if (!failed || attempt >= PHOTO_RETRIES) return undefined
    if (__DEV__) console.warn('[cover photo] 읽기 실패, 다시 시도', id, entry.error?.code ?? entry.error?.message)
    const timer = setTimeout(() => { setAttempt(value => value + 1); mediaService.resolveDisplay(id).catch(() => {}) }, 500 * (attempt + 1))
    return () => clearTimeout(timer)
  }, [failed, attempt, id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [drawAttempt, setDrawAttempt] = useState(0)
  // 그리기 재시도 타이머는 표지가 사라지면(휴지통 · 넘김) 함께 멈춘다
  const drawRetry = useRef(null)
  useEffect(() => () => clearTimeout(drawRetry.current), [])
  if (!uri) return null
  // expo-image: PDF 쪽처럼 큰 사진도 표지 크기에 맞춰 줄여 풀고 메모리 · 디스크에 캐시해 다시 들어올 때 바로 뜬다
  return <CachedImage key={drawAttempt} source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={id ?? uri}
    onError={event => {
      if (drawAttempt >= PHOTO_RETRIES) return
      if (__DEV__) console.warn('[cover photo] 그리기 실패, 다시 시도', id, event?.error)
      clearTimeout(drawRetry.current)
      drawRetry.current = setTimeout(() => setDrawAttempt(value => value + 1), 500 * (drawAttempt + 1))
    }} />
}

function StickerImage({ item }) {
  const uri = useMediaUri(item.asset || item.builtin ? null : item, { still: true })
  const source = stickerSource(item, true, uri)
  const builtin = builtinStickerOf(item.builtin)
  if (builtin) return <BuiltinStickerArt sticker={builtin} canvas width="100%" height="100%" />
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

/**
 * 표지 그림. width · height 를 알면 그 크기로, height 가 없으면 부모를 채우고 width 로만 글자 크기를 맞춘다.
 * edit 를 넘기면 표지 위 제목 라벨과 스티커를 끌어 옮길 수 있다.
 */
function CoverArt({ cover, name, width, height, edit = null, shadow = null, pixelScale = 1 }) {
  const [selected, setSelected] = useState(null)
  const titleOrigin = useRef({ x: 0, y: 0 })
  const drafts = useRef(null)
  if (!drafts.current) drafts.current = createDraftStore()
  const { scale, bandOut, left: cornerLeft, right: cornerRight } = coverBody(width, height)
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
  // 띠지 글은 붙인 쪽 끝에서 띠 폭 8% 안쪽에서 시작한다(하드커버 노트 띠지 참고). 반대쪽과 가운데 정렬은 오른쪽 고무줄을 비키게 22% 를 둔다.
  const bandRight = cover.band.on && cover.band.dir === 'v' && cover.band.pos === 'near'
  const ribbonPad = { left: horizontal === 'l' ? '8%' : '22%', right: horizontal === 'r' && !bandRight ? '8%' : '22%' }
  // 띠지는 소제목이 없으면 위아래를 조금 더 띄워 제목 한 줄만으로도 띠 모양이 살게 한다
  const plate = cover.plate === 'paper' ? [styles.paperPlate, { borderRadius: 4 * scale, paddingHorizontal: 12 * scale, paddingVertical: 10 * scale }]
    : ribbon ? [{ backgroundColor: cover.ribbon?.color ?? '#F3F2ED', alignItems: align, paddingLeft: ribbonPad.left, paddingRight: ribbonPad.right, paddingVertical: (hasSubtitle ? 15 : 19) * scale }] : null
  // 띠지 안 제목과 소제목 사이 실선 (둘 다 있을 때만, 글 폭 전체)
  const rule = ribbon && !!title && !!hasSubtitle && <View style={[styles.fill, { height: Math.max(0.5, 0.5 * scale), marginVertical: 4.5 * scale, backgroundColor: cover.title.color, opacity: 0.35 }]} />
  const ribbonEdges = ribbon && <RibbonPaper ink={cover.title.color} scale={scale} />
  const titleFont = textStyle({ font: cover.title.font, fontSize: cover.title.size * (FONT_SCALE[cover.title.font] ?? 1), color: cover.title.color, bold: true, lineSpacing: 1.15 }, scale, Platform.OS)
  const bandWidth = Math.max(4.5, 9 * scale)
  // 실제 고무줄처럼 표지 위아래(가로 띠는 좌우) 가장자리 밖으로 살짝 튀어나온다
  // 표지 본체 크기. 고무줄을 켜고 끄거나 방향을 바꿔도 표지 크기가 달라지지 않게 늘 네 변을 bandOut 만큼 줄인다.
  const bodyWidth = width - bandOut * 2, bodyHeight = (height ?? width) - bandOut * 2
  // 'auto' 는 표지 색을 같은 계열로 조금 어둡게 한 고무줄 (사진 표지는 따를 바탕색이 없어 기본 남색)
  const stops = gradientStops(cover)
  const bandColor = cover.band.color !== 'auto' ? cover.band.color : bandAutoColor(cover)
  const band = cover.band.on && (cover.band.dir === 'v'
    ? { top: 0, bottom: 0, width: bandWidth, ...(cover.band.pos === 'center' ? { left: '50%', marginLeft: -bandWidth / 2 } : { right: '15%' }) }
    : { left: 0, right: 0, height: bandWidth, ...(cover.band.pos === 'center' ? { top: '50%', marginTop: -bandWidth / 2 } : { bottom: '14%' }) })
  // 종이 라벨은 왼쪽 · 오른쪽 정렬이어도 칸 전체 폭까지 쓴다. 칸이 오른쪽 고무줄 자리만큼 이미 줄어 있어(표지 폭 67%) 78% 를 또 걸면
  // 세로 표지에서 '새 다이어리'(나눔고딕 굵게 4.98em)부터 두 줄이 됐다. 판 없는 글씨만 예전처럼 78% 로 줄 길이를 묶는다.
  const titleArea = (title || hasSubtitle) ? <View pointerEvents="box-none" style={[styles.titleBox, place]}
    onLayout={event => { titleOrigin.current = event.nativeEvent.layout }}>
    <TitleBox edit={edit} ribbon={ribbon} width={bodyWidth} height={bodyHeight} at={at} origin={titleOrigin}
      onSelect={() => select(null)} onMove={next => edit.onChange({ ...cover, title: { ...cover.title, at: next } })}
      style={[plate, !ribbon && { maxWidth: at ? bodyWidth * 0.78 : centered || cover.plate === 'paper' ? '100%' : '78%' }]}>
      {ribbonEdges}
      {title ? <Text numberOfLines={3} lineBreakStrategyIOS="hangul-word" style={[titleFont, styles.fill, styles.keepWords, { textAlign }]}>{title}</Text> : null}
      {rule}
      {hasSubtitle ? <Text numberOfLines={1} style={[styles.subtitle, ribbon && styles.fill, { textAlign, color: cover.subtitle.color, fontSize: Math.max(5, cover.subtitle.size * scale), letterSpacing: cover.subtitle.size * scale * 0.086, marginTop: ribbon ? 0 : 4 * scale }]}>{cover.subtitle.text}</Text> : null}
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
  const lineColor = coverLineColor(cover)
  const corners = { borderTopLeftRadius: cornerLeft, borderBottomLeftRadius: cornerLeft, borderTopRightRadius: cornerRight, borderBottomRightRadius: cornerRight }
  // 표지 본체는 고무줄이 튀어나올 만큼 안쪽으로 줄여 둥근 모서리로 자르고, 고무줄은 이 영역 끝까지 그린다.
  // 튀어나온 끝이 영역 안에 있어 목록 · 스와이프 · 편집 어디서 부모가 잘라도 똑같이 보인다.
  // 띠지는 고무줄 아래(고무줄이 띠지 위로 지나감), 종이 라벨 · 판 없음과 스티커는 고무줄 위에 놓인다.
  // 고무줄을 끄거나 방향을 바꿔도 본체는 같은 자리 · 크기다. (예전에는 고무줄을 켠 방향으로만 줄여 높이가 달라 보였다)
  const body = { ...corners, top: bandOut, bottom: bandOut, left: bandOut, right: bandOut }
  // 사진 표지는 사진이 뜨기 전에 사진의 대표색(photo.tone)을 깔아 회색으로 비치지 않게 한다
  const base = cover.kind === 'photo' ? cover.photo?.tone ?? '#C9CED8' : stops ? stops[0] : cover.color
  const hasGradient = cover.kind !== 'photo' && Boolean(stops)
  const bodyInset = { top: bandOut + 1, bottom: bandOut + 1, left: bandOut + 1, right: bandOut + 1 }
  // 웹에서 스티커 · 라벨을 끄는 동안 제목 글자가 선택되지 않게
  return <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, edit && Platform.OS === 'web' && styles.noSelect]}>
  {/* 그림자는 잘라 그리는 본체에서는 iOS 에서 잘리므로 같은 자리에 따로 깐다 */}
  {/* 그라데이션 표지: 첫 색(바탕색)을 깔면 둥근 모서리의 반투명 가장자리로 그 색이 선처럼 비친다(예: 노을의 분홍이 파란 아래쪽 바깥으로). 그림자 층은 1px 안쪽으로 줄여 가려 두고, 잘라 그리는 층은 바탕 없이 그라데이션만 그린다 */}
  {shadow && <View pointerEvents="none" style={[styles.layer, body, { backgroundColor: base }, hasGradient && bodyInset, shadow]} />}
  <View style={[styles.layer, styles.clip, body, { backgroundColor: hasGradient ? 'transparent' : base }]}>
    {cover.kind === 'photo' ? (cover.photo?.src ? <OwnPhoto photo={cover.photo} />
      : <View style={styles.noPhoto}><Icon name="image" size={Math.max(18, 30 * scale)} color="#FFFFFF" /></View>)
      : <>{stops && <GradientFill stops={stops} initialWidth={bodyWidth} initialHeight={bodyHeight} />}<CoverPattern pattern={cover.pattern.type} tone={cover.pattern.tone} scale={scale} line={lineColor} pixelScale={pixelScale} initialWidth={bodyWidth} initialHeight={bodyHeight} /></>}
    {edit && <Pressable accessibilityLabel="표지 스티커 선택 해제" onPress={() => select(null)} style={StyleSheet.absoluteFill} />}
    <View pointerEvents="none" style={[styles.spine, { width: '4.9%' }]} />
    {ribbon && titleArea}
  </View>
  {band && <ElasticBand vertical={cover.band.dir === 'v'} color={bandColor} scale={scale} radius={bandWidth * 0.3} style={band} />}
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
  photoClip: { overflow: 'hidden' },
  layer: { position: 'absolute' },
  clip: { overflow: 'hidden' },
  fill: { alignSelf: 'stretch' },
  // 한글 제목은 낱말 가운데에서 끊지 않는다 (iOS 는 lineBreakStrategyIOS, 웹은 word-break)
  keepWords: Platform.OS === 'web' ? { wordBreak: 'keep-all' } : {},
  spine: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11,23,102,.16)' },
  band: { position: 'absolute' },
  bandShadow: { backgroundColor: 'rgba(0,0,0,.12)' },
  titleBox: { position: 'absolute' },
  paperPlate: { backgroundColor: 'rgba(245,244,239,.96)', shadowColor: colors.text, shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  subtitle: { fontWeight: '800' },
  sticker: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  noPhoto: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  titleSelected: { borderWidth: 1.5, borderColor: colors.primaryStrong, borderStyle: 'dashed' },
  stickerImage: { width: '100%', height: '100%' },
  ribbonEdge: { position: 'absolute', left: 0, right: 0 },
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
    backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(129,138,195,0.2)', shadowColor: colors.text, shadowOpacity: 0.16, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  barButton: { width: 42, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  barPressed: {}, // 눌림 효과 없음(사용자 지시)
  none: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: 'rgba(255,255,255,.7)' },
  noneTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
})
