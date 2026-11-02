import { useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Image as SvgImage, Path, Rect, Text as SvgText } from 'react-native-svg'
import { colors } from '../../../shared/theme'
import { cropBetween, imagePoint, previewLoadMatches } from '../../utils/stickerSplit.js'
import { adjustCrop, cropAction, CROP_HANDLES, handlePoint } from '../../utils/stickerSplitCrop.js'

const limit = (v, min, max) => Math.max(min, Math.min(max, v))
export default function StickerSplitPreview({ source, parts, selected, groups = [], focusedGroupId, focusedPartId, targetGroupIds = [], crop, background, mode, working, view, onView, onCrop, onPoint, onInteraction, onBrush, brushSize = 24, adjustableCrop = false, cropDefined = false, onReady, height = 320 }) {
  const [frame, setFrame] = useState({ width: 0, height: 0 })
  const latestFrame = useRef(frame)
  latestFrame.current = frame
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const token = `${source.previewUri ?? source.uri}:${attempt}`, latestToken = useRef(token)
  latestToken.current = token
  const ready = frame.width > 0 && frame.height > 0 && loading?.token === token && loading.ready
  const [brush, setBrush] = useState(null)
  const [backgroundTagSize, setBackgroundTagSize] = useState({ width: 124, height: 36 })
  const gesture = useRef(null)
  const scale = Math.min(frame.width / source.width, frame.height / source.height) * view.zoom
  const w = source.width * scale, h = source.height * scale
  const dx = (frame.width - w) / 2 + view.x, dy = (frame.height - h) / 2 + view.y
  // Move/release locationX can refer to a different native target. Anchor once
  // on the dedicated input view, then use page-coordinate deltas consistently.
  const origin = useRef({ x: 0, y: 0 })
  const local = (e, clamp = false) => imagePoint(e.nativeEvent.pageX - origin.current.x, e.nativeEvent.pageY - origin.current.y, frame, source, view, clamp)
  const rawPoint = e => ({ x: (e.nativeEvent.pageX - origin.current.x - dx) / w, y: (e.nativeEvent.pageY - origin.current.y - dy) / h })
  function pinch(e) {
    const [a, b] = e.nativeEvent.touches
    if (!a || !b) return
    gesture.current = { type: 'pinch', distance: Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)), view,
      x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2,
      localX: (a.pageX + b.pageX) / 2 - origin.current.x, localY: (a.pageY + b.pageY) / 2 - origin.current.y }
    setDraft(null)
    setBrush(null)
  }
  function start(e) {
    if (!ready || working) return
    origin.current = { x: e.nativeEvent.pageX - e.nativeEvent.locationX, y: e.nativeEvent.pageY - e.nativeEvent.locationY }
    onInteraction(true)
    if (e.nativeEvent.touches.length >= 2) { pinch(e); return }
    const p = local(e)
    if (adjustableCrop && (mode === 'crop' || mode === 'add')) {
      const start = rawPoint(e), action = cropAction(start, crop, w, h, cropDefined)
      gesture.current = { type: 'adjust', p: start, action, crop, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }
      if (action !== 'ignore') setDraft(adjustCrop(crop, start, start, action, source))
      return
    }
    gesture.current = { type: mode.startsWith('brush-') ? (p ? 'brush' : 'ignore') : mode === 'crop' || mode === 'add' ? 'crop' : mode === 'pan' ? 'pan' : 'tap',
      p, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, view }
    if (gesture.current.type === 'brush') { gesture.current.points = [p]; gesture.current.radius = brushSize / (2 * scale); gesture.current.action = mode === 'brush-split' ? 'split' : mode === 'brush-add'; setBrush([p]) }
    if (p && (mode === 'crop' || mode === 'add')) setDraft({ a: p, b: p })
  }
  function move(e) {
    const g = gesture.current
    if (!g) return
    if (e.nativeEvent.touches.length >= 2) {
      if (g.type !== 'pinch') { pinch(e); return }
      const [a, b] = e.nativeEvent.touches
      const zoom = limit(g.view.zoom * Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) / g.distance, 1, 6)
      const ratio = zoom / g.view.zoom
      onView({ zoom, x: limit(g.view.x * ratio + (g.localX - frame.width / 2) * (1 - ratio) + (a.pageX + b.pageX) / 2 - g.x, -frame.width * zoom / 2, frame.width * zoom / 2),
        y: limit(g.view.y * ratio + (g.localY - frame.height / 2) * (1 - ratio) + (a.pageY + b.pageY) / 2 - g.y, -frame.height * zoom / 2, frame.height * zoom / 2) })
    } else if (g.type === 'adjust' && g.action !== 'ignore') setDraft(adjustCrop(g.crop, g.p, rawPoint(e), g.action, source))
    else if (g.type === 'brush') {
      // Keep the actual outside path; clamping would bend the brush along the image edge.
      const p = { x: (e.nativeEvent.pageX - origin.current.x - dx) / w, y: (e.nativeEvent.pageY - origin.current.y - dy) / h }
      const previous = g.points.at(-1)
      if (Math.hypot((p.x - previous.x) * w, (p.y - previous.y) * h) >= 1) { g.points.push(p); setBrush(g.points.slice(-256)) }
    } else if (g.type === 'crop' && g.p) setDraft({ a: g.p, b: local(e, true) })
    else if (g.type === 'pan') onView({ ...g.view, x: limit(g.view.x + e.nativeEvent.pageX - g.x, -frame.width * view.zoom / 2, frame.width * view.zoom / 2), y: limit(g.view.y + e.nativeEvent.pageY - g.y, -frame.height * view.zoom / 2, frame.height * view.zoom / 2) })
  }
  function end(e) {
    const g = gesture.current
    gesture.current = null; setDraft(null); setBrush(null); onInteraction(false)
    if (!g) return
    if (g.type === 'adjust' && g.action !== 'ignore') {
      const rect = adjustCrop(g.crop, g.p, rawPoint(e), g.action, source)
      if (Math.hypot(e.nativeEvent.pageX - g.x, e.nativeEvent.pageY - g.y) >= 6 && rect.width + 1e-9 >= 0.005 && rect.height + 1e-9 >= 0.005) onCrop(rect)
    } else if (g.type === 'brush') {
      const last = { x: (e.nativeEvent.pageX - origin.current.x - dx) / w, y: (e.nativeEvent.pageY - origin.current.y - dy) / h }
      onBrush?.([...g.points, last].map(p => ({ x: p.x * source.width, y: p.y * source.height })), g.radius, g.action)
    } else if (g.type === 'crop' && g.p) {
      if (Math.hypot(e.nativeEvent.pageX - g.x, e.nativeEvent.pageY - g.y) < 6) return
      try { onCrop(cropBetween(g.p, local(e, true))) } catch { /* Ignore zero-area drags. */ }
    } else if (g.type === 'tap' && Math.hypot(e.nativeEvent.pageX - g.x, e.nativeEvent.pageY - g.y) < 8) {
      const p = local(e); if (p) onPoint(p)
    }
  }
  const rect = draft ? (draft.a ? { x: Math.min(draft.a.x, draft.b.x), y: Math.min(draft.a.y, draft.b.y), width: Math.abs(draft.b.x - draft.a.x), height: Math.abs(draft.b.y - draft.a.y) } : draft) : crop
  const chosen = new Set(selected)
  const brushing = mode.startsWith('brush-')
  const sampleWidth = source.previewWidth ?? source.width, sampleHeight = source.previewHeight ?? source.height
  const sampleX = background ? Math.min(sampleWidth - 1, Math.floor(background.x * sampleWidth)) : 0
  const sampleY = background ? Math.min(sampleHeight - 1, Math.floor(background.y * sampleHeight)) : 0
  const pin = background && { x: dx + background.x * w, y: dy + background.y * h }
  const showBackgroundTag = ready && pin && pin.x >= 0 && pin.x <= frame.width && pin.y >= 0 && pin.y <= frame.height
  const tagLeft = pin ? limit(pin.x + 12, 8, Math.max(8, frame.width - backgroundTagSize.width - 8)) : 0
  const tagMinTop = Math.min(48, Math.max(8, frame.height - backgroundTagSize.height - 60))
  const tagMaxTop = Math.max(tagMinTop, frame.height - backgroundTagSize.height - 60)
  const tagTop = pin ? limit(pin.y + 10 + backgroundTagSize.height <= frame.height - 60 ? pin.y + 10 : pin.y - backgroundTagSize.height - 10, tagMinTop, tagMaxTop) : 0
  const path = active => parts.filter(p => chosen.has(p.id) === active).map(p => `M${dx + p.x * scale},${dy + p.y * scale}h${p.width * scale}v${p.height * scale}h${-p.width * scale}Z`).join('')
  return <View testID="sticker-split-preview" style={[styles.frame, { height }]} onLayout={e => { latestFrame.current = e.nativeEvent.layout; setFrame(e.nativeEvent.layout); onReady?.(source.uri, !!(loading?.token === token && loading.ready && e.nativeEvent.layout.width > 0 && e.nativeEvent.layout.height > 0)) }}>
    {frame.width > 0 && frame.height > 0 && <Image key={token} source={{ uri: source.previewUri ?? source.uri }} resizeMode="contain" pointerEvents="none"
      onLoad={e => { if (latestToken.current === token) {
        const size = e?.nativeEvent?.source
        const valid = previewLoadMatches(source, size)
        setLoading({ token, ready: valid, error: !valid }); onReady?.(source.uri, valid && latestFrame.current.width > 0 && latestFrame.current.height > 0)
      } }}
      onError={() => { if (latestToken.current === token) { gesture.current = null; setDraft(null); setBrush(null); onInteraction(false); setLoading({ token, ready: false, error: true }); onReady?.(source.uri, false) } }}
      style={{ position: 'absolute', left: dx, top: dy, width: w, height: h }} />}
    <Svg pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: ready ? 1 : 0 }]} width="100%" height="100%">
      <Path d={path(false)} fill={colors.surface} fillOpacity={0.65} stroke="none" />
      <Path d={path(false)} fill="none" stroke={colors.textMuted} strokeWidth={1} />
      {!groups.length && <Path d={path(true)} fill="none" stroke={colors.primary} strokeWidth={2} />}
      {groups.filter(g => dx + (g.x + g.width) * scale >= 0 && dy + (g.y + g.height) * scale >= 0 && dx + g.x * scale <= frame.width && dy + g.y * scale <= frame.height).map(g => {
        const focused = g.id === focusedGroupId || targetGroupIds.includes(g.id)
        return <Rect key={g.id} x={dx + g.x * scale} y={dy + g.y * scale} width={g.width * scale} height={g.height * scale}
          fill={focused ? colors.primarySoft : 'none'} stroke={focused ? colors.primaryStrong : colors.primary} strokeWidth={focused ? 3 : 1} />
      })}
      {parts.filter(part => part.id === focusedPartId).map(part => <Rect key={`focus-${part.id}`} x={dx + part.x * scale} y={dy + part.y * scale}
        width={part.width * scale} height={part.height * scale} fill="none" stroke={colors.primaryStrong} strokeWidth={3} strokeDasharray="4 3" />)}
      {!brushing && groups.filter(g => dx + g.x * scale >= 0 && dy + g.y * scale >= 0 && dx + g.x * scale < frame.width && dy + g.y * scale < frame.height).map(g => <SvgText key={g.id} x={dx + g.x * scale + 2} y={Math.max(14, dy + g.y * scale - 3)} fill={colors.text} stroke={colors.surface} strokeWidth={0.3} fontSize={14} fontWeight="700">{g.number}</SvgText>)}
      {(mode === 'crop' || mode === 'add' || crop.width < 1 || crop.height < 1) && <Rect x={dx + rect.x * w} y={dy + rect.y * h} width={rect.width * w} height={rect.height * h} fill={draft ? colors.primarySoft : 'none'} fillOpacity={0.3} stroke={colors.primary} strokeWidth={2} strokeDasharray="6 4" />}
      {adjustableCrop && (mode === 'crop' || mode === 'add') && cropDefined && CROP_HANDLES.map(handle => {
        const point = handlePoint(rect, handle)
        return <Rect key={handle} x={dx + point.x * w - 5} y={dy + point.y * h - 5} width={10} height={10} rx={2} fill={colors.surface} stroke={colors.primary} strokeWidth={2} />
      })}
      {background && <Circle cx={dx + background.x * w} cy={dy + background.y * h} r={6} fill={colors.surface} stroke={colors.text} strokeWidth={2} />}
      {showBackgroundTag && <Path d={`M${pin.x},${pin.y}L${tagLeft + 8},${tagTop}`} fill="none" stroke={colors.primary} strokeWidth={1} />}
      {brush && <Path d={brush.map((p, i) => `${i ? 'L' : 'M'}${dx + p.x * w},${dy + p.y * h}`).join(' ')} fill="none" stroke={mode === 'brush-remove' ? colors.danger : colors.primary} strokeOpacity={0.4} strokeWidth={brushSize} strokeLinecap="round" strokeLinejoin="round" />}
      {brush && <Circle cx={dx + brush.at(-1).x * w} cy={dy + brush.at(-1).y * h} r={brushSize / 2} fill="none" stroke={colors.text} strokeWidth={1} />}
    </Svg>
    {showBackgroundTag && <View pointerEvents="none" testID="sticker-background-tag" style={[styles.backgroundTag, { left: tagLeft, top: tagTop, maxWidth: Math.max(0, frame.width - 16) }]}
      onLayout={event => setBackgroundTagSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
      <View testID="sticker-background-swatch" style={styles.swatch}>
        <Svg width={18} height={18} viewBox={`${sampleX} ${sampleY} 1 1`}><SvgImage href={{ uri: source.previewUri ?? source.uri }} width={sampleWidth} height={sampleHeight} /></Svg>
      </View>
      <Text style={styles.message}>배경 지정색</Text>
    </View>}
    {!ready && <View style={styles.status}>{loading?.token === token && loading.error ? <><Text style={styles.message}>미리보기를 불러오지 못했어요.</Text><Pressable accessibilityRole="button" accessibilityLabel="미리보기 다시 시도" style={styles.retry} onPress={() => { setAttempt(value => value + 1); setLoading(null); onReady?.(source.uri, false) }}><Text style={styles.message}>다시 시도</Text></Pressable></> : <><ActivityIndicator color={colors.primary} /><Text style={styles.message}>미리보기를 불러오고 있어요…</Text></>}</View>}
    <View collapsable={false} pointerEvents={ready && !working ? 'auto' : 'none'} style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => ready && !working}
      onMoveShouldSetResponder={() => ready && !working} onResponderGrant={start} onResponderStart={e => { if (ready && e.nativeEvent.touches.length >= 2) pinch(e) }} onResponderMove={move} onResponderRelease={end}
      onResponderTerminationRequest={() => false} onResponderTerminate={() => { gesture.current = null; setDraft(null); setBrush(null); onInteraction(false) }} />
  </View>
}
const styles = StyleSheet.create({ frame: { overflow: 'hidden', backgroundColor: colors.surfaceMuted }, swatch: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }, backgroundTag: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }, status: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, gap: 8 }, message: { color: colors.text, fontSize: 14, fontWeight: '600' }, retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 9, borderWidth: 1, borderColor: colors.border } })
