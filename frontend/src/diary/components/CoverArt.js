import { memo, useRef, useState } from 'react'
import { Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import CoverPattern from './CoverPattern'
import Icon from '../../editor/components/controls/Icon'
import { useMediaUri } from '../../editor/hooks/useMediaUri'
import { stickerSource } from '../../editor/stickerAssets'
import { textStyle } from '../../editor/utils/text'
import { STICKER_SIZE, bandAutoColor, coverTitle, gradientStops, mix } from '../utils/coverDesign'
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
function ElasticBand({ vertical, color, scale, radius, style }) {
  const edge = mix(color, '#1C2233', 0.24)
  const line = Math.max(0.5, 0.6 * scale)
  const shadow = Math.max(1, 1.4 * scale)
  return <View pointerEvents="none" style={[styles.band, style]}>
    <View style={[StyleSheet.absoluteFill, styles.bandShadow, { borderRadius: radius }, vertical ? { left: shadow, right: -shadow } : { top: shadow, bottom: -shadow }]} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: color, borderColor: edge, borderRadius: radius, borderWidth: line }]} />
  </View>
}
function GradientFill({ stops }) {
  const id = useRef(`dio-cover-gradient-${(nextGradientId += 1)}`).current
  return <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
    <Defs><LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      {stops.map((color, i) => <Stop key={i} offset={i / (stops.length - 1)} stopColor={color} />)}
    </LinearGradient></Defs>
    <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
  </Svg>
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

/** 표지 위 스티커: 끌어 옮기고, 오른쪽 아래 모서리로 크기를 바꾸고, ✕ 로 뺀다. (편집기 스티커와 같은 손놀림) */
function EditableSticker({ item, scale, width, height, selected, onSelect, onChange, onRemove }) {
  // 응답기는 한 번만 만들고, 크기·자리·콜백은 매번 최신 값을 읽는다.
  const latest = useRef(null)
  latest.current = { item, scale, width, height, onSelect, onChange }
  const start = useRef(null)
  const move = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = latest.current.item; latest.current.onSelect(latest.current.item.id) },
    onPanResponderMove: (_, g) => {
      const from = start.current, { width: w, height: h } = latest.current
      latest.current.onChange({ ...from, x: Math.max(0, Math.min(100, from.x + g.dx / w * 100)), y: Math.max(0, Math.min(100, from.y + g.dy / h * 100)) })
    },
    onPanResponderTerminationRequest: () => false,
  })).current
  const resize = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = latest.current.item },
    onPanResponderMove: (_, g) => {
      const from = start.current
      latest.current.onChange({ ...from, size: Math.round(Math.max(STICKER_SIZE.min, Math.min(STICKER_SIZE.max, from.size + (g.dx + g.dy) / 4 / latest.current.scale))) })
    },
    onPanResponderTerminationRequest: () => false,
  })).current
  const side = item.size * scale * 2
  return <View style={[styles.sticker, { left: `${item.x}%`, top: `${item.y}%`, width: side, height: side, marginLeft: -side / 2, marginTop: -side / 2 }, selected && styles.stickerSelected]}
    accessibilityRole="adjustable" accessibilityLabel={`표지 스티커 ${item.name ?? ''}`} {...move.panHandlers}>
    <StickerImage item={item} />
    {selected && <>
      <Pressable accessibilityRole="button" accessibilityLabel="표지 스티커 빼기" hitSlop={10} onPress={() => onRemove(item.id)} style={[styles.handle, styles.remove]}>
        <Icon name="close" size={12} color="#FFFFFF" strokeWidth={2.4} />
      </Pressable>
      <View accessibilityLabel="표지 스티커 크기" hitSlop={10} style={[styles.handle, styles.resize]} {...resize.panHandlers} />
    </>}
  </View>
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
function CoverArt({ cover, name, width, height, edit = null, shadow = null }) {
  const [selected, setSelected] = useState(null)
  const titleOrigin = useRef({ x: 0, y: 0 })
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
  const plate = cover.plate === 'paper' ? [styles.paperPlate, { borderRadius: 4 * scale, paddingHorizontal: 12 * scale, paddingVertical: 10 * scale }]
    : ribbon ? [styles.ribbonPlate, { backgroundColor: cover.ribbon?.color ?? '#F3F2ED',alignItems: align, paddingHorizontal: '22%', paddingVertical: 15 * scale }] : null
  const hasSubtitle = cover.subtitle.on && cover.subtitle.text
  // 띠지 안 제목과 소제목 사이의 짧은 가로선 (둘 다 있을 때만)
  const rule = ribbon && !!title && !!hasSubtitle && <View style={[styles.rule, { height: Math.max(0.75, 0.9 * scale), marginVertical: 5 * scale, backgroundColor: cover.title.color }]} />
  const titleFont = textStyle({ font: cover.title.font, fontSize: cover.title.size * (FONT_SCALE[cover.title.font] ?? 1), color: cover.title.color, bold: true, lineSpacing: 1.15 }, scale, Platform.OS)
  const bandWidth = Math.max(4.5, 9 * scale)
  // 실제 고무줄처럼 표지 위아래(가로 띠는 좌우) 가장자리 밖으로 살짝 튀어나온다
  const bandOut = Math.max(0.75, 1.25 * scale)
  // 'auto' 는 표지 색을 같은 계열로 조금 어둡게 한 고무줄 (사진 표지는 따를 바탕색이 없어 기본 남색)
  const stops = gradientStops(cover)
  const bandColor = cover.band.color !== 'auto' ? cover.band.color : bandAutoColor(cover)
  const band = cover.band.on && (cover.band.dir === 'v'
    ? { top: 0, bottom: 0, width: bandWidth, ...(cover.band.pos === 'center' ? { left: '50%', marginLeft: -bandWidth / 2 } : { right: '15%' }) }
    : { left: 0, right: 0, height: bandWidth, ...(cover.band.pos === 'center' ? { top: '50%', marginTop: -bandWidth / 2 } : { bottom: '14%' }) })
  const titleArea = (title || hasSubtitle) ? <View pointerEvents="box-none" style={[styles.titleBox, place]}
    onLayout={event => { titleOrigin.current = event.nativeEvent.layout }}>
    <TitleBox edit={edit} ribbon={ribbon} width={width} height={height ?? width} at={at} origin={titleOrigin}
      onSelect={() => select(null)} onMove={next => edit.onChange({ ...cover, title: { ...cover.title, at: next } })}
      style={[plate, !ribbon && { maxWidth: at ? width * 0.78 : centered ? '100%' : '78%' }]}>
      {title ? <Text numberOfLines={3} lineBreakStrategyIOS="hangul-word" style={[titleFont, styles.fill, styles.keepWords, { textAlign }]}>{title}</Text> : null}
      {rule}
      {hasSubtitle ? <Text numberOfLines={1} style={[styles.subtitle, ribbon && styles.fill, { textAlign, color: cover.subtitle.color, fontSize: Math.max(5, cover.subtitle.size * scale), letterSpacing: cover.subtitle.size * scale * 0.12, marginTop: ribbon ? 0 : 4 * scale }]}>{cover.subtitle.text}</Text> : null}
    </TitleBox>
  </View> : null
  const select = id => { setSelected(id); edit?.onSelectSticker?.(id) }
  const changeSticker = next => edit.onChange({ ...cover, stickers: cover.stickers.map(item => item.id === next.id ? next : item) })
  const removeSticker = id => { setSelected(null); edit.onChange({ ...cover, stickers: cover.stickers.filter(item => item.id !== id) }) }
  const corners = { borderTopLeftRadius: 6 * scale, borderBottomLeftRadius: 6 * scale, borderTopRightRadius: 14 * scale, borderBottomRightRadius: 14 * scale }
  // 표지 본체는 고무줄이 튀어나올 만큼 안쪽으로 줄여 둥근 모서리로 자르고, 고무줄은 이 영역 끝까지 그린다.
  // 튀어나온 끝이 영역 안에 있어 목록 · 스와이프 · 편집 어디서 부모가 잘라도 똑같이 보인다.
  // 띠지는 고무줄 아래(고무줄이 띠지 위로 지나감), 종이 라벨 · 판 없음과 스티커는 고무줄 위에 놓인다.
  const body = { ...corners, ...(!cover.band.on ? { top: 0, bottom: 0, left: 0, right: 0 } : cover.band.dir === 'v' ? { top: bandOut, bottom: bandOut, left: 0, right: 0 } : { top: 0, bottom: 0, left: bandOut, right: bandOut }) }
  const base = cover.kind === 'photo' ? '#C9CED8' : stops ? stops[0] : cover.color
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
  {/* 그림자는 잘라 그리는 본체에서는 iOS 에서 잘리므로 같은 자리에 따로 깐다 */}
  {shadow && <View pointerEvents="none" style={[styles.layer, body, { backgroundColor: base }, shadow]} />}
  <View style={[styles.layer, styles.clip, body, { backgroundColor: base }]}>
    {cover.kind === 'photo' ? (cover.photo?.src ? <OwnPhoto photo={cover.photo} />
      : <View style={styles.noPhoto}><Icon name="image" size={Math.max(18, 30 * scale)} color="#FFFFFF" /></View>)
      : <>{stops && <GradientFill stops={stops} />}<CoverPattern pattern={cover.pattern.type} tone={cover.pattern.tone} /></>}
    {edit && <Pressable accessibilityLabel="표지 스티커 선택 해제" onPress={() => select(null)} style={StyleSheet.absoluteFill} />}
    <View pointerEvents="none" style={[styles.spine, { width: '4.9%' }]} />
    {ribbon && titleArea}
  </View>
  {band && <ElasticBand vertical={cover.band.dir === 'v'} color={bandColor} scale={scale} radius={bandWidth * 0.3} style={band} />}
  <View pointerEvents="box-none" style={[styles.layer, styles.clip, body]}>
    {!ribbon && titleArea}
    {cover.stickers.map(item => edit && height
      ? <EditableSticker key={item.id} item={item} scale={scale} width={width} height={height} selected={selected === item.id} onSelect={select} onChange={changeSticker} onRemove={removeSticker} />
      : <View key={item.id} pointerEvents="none" style={[styles.sticker, { left: `${item.x}%`, top: `${item.y}%`, width: item.size * scale * 2, height: item.size * scale * 2, marginLeft: -item.size * scale, marginTop: -item.size * scale }]}><StickerImage item={item} /></View>)}
  </View>
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
  stickerSelected: { borderWidth: 1.5, borderColor: colors.primaryStrong, borderStyle: 'dashed', borderRadius: 4 },
  stickerImage: { width: '100%', height: '100%' },
  handle: { position: 'absolute', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  remove: { top: -11, right: -11, backgroundColor: colors.danger },
  resize: { bottom: -11, right: -11, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primaryStrong },
  none: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: 'rgba(255,255,255,.7)' },
  noneTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
})
