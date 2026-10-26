import { useRef, useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { colors } from '../../../shared/theme'
import { cropBetween, imagePoint } from '../../utils/stickerSplit.js'

const limit = (v, min, max) => Math.max(min, Math.min(max, v))
export default function StickerSplitPreview({ source, parts, selected, crop, background, mode, working, view, onView, onCrop, onPoint, onInteraction }) {
  const [frame, setFrame] = useState({ width: 1, height: 1 })
  const [draft, setDraft] = useState(null)
  const gesture = useRef(null)
  const scale = Math.min(frame.width / source.width, frame.height / source.height) * view.zoom
  const w = source.width * scale, h = source.height * scale
  const dx = (frame.width - w) / 2 + view.x, dy = (frame.height - h) / 2 + view.y
  // Move/release locationX can refer to a different native target. Anchor once
  // on the dedicated input view, then use page-coordinate deltas consistently.
  const origin = useRef({ x: 0, y: 0 })
  const local = (e, clamp = false) => imagePoint(e.nativeEvent.pageX - origin.current.x, e.nativeEvent.pageY - origin.current.y, frame, source, view, clamp)
  function pinch(e) {
    const [a, b] = e.nativeEvent.touches
    if (!a || !b) return
    gesture.current = { type: 'pinch', distance: Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)), view,
      x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2,
      localX: (a.pageX + b.pageX) / 2 - origin.current.x, localY: (a.pageY + b.pageY) / 2 - origin.current.y }
    setDraft(null)
  }
  function start(e) {
    origin.current = { x: e.nativeEvent.pageX - e.nativeEvent.locationX, y: e.nativeEvent.pageY - e.nativeEvent.locationY }
    onInteraction(true)
    if (e.nativeEvent.touches.length >= 2) { pinch(e); return }
    const p = local(e)
    gesture.current = { type: mode === 'crop' || mode === 'add' ? 'crop' : mode === 'pan' ? 'pan' : 'tap',
      p, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, view }
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
    } else if (g.type === 'crop' && g.p) setDraft({ a: g.p, b: local(e, true) })
    else if (g.type === 'pan') onView({ ...g.view, x: limit(g.view.x + e.nativeEvent.pageX - g.x, -frame.width * view.zoom / 2, frame.width * view.zoom / 2), y: limit(g.view.y + e.nativeEvent.pageY - g.y, -frame.height * view.zoom / 2, frame.height * view.zoom / 2) })
  }
  function end(e) {
    const g = gesture.current
    gesture.current = null; setDraft(null); onInteraction(false)
    if (!g) return
    if (g.type === 'crop' && g.p) {
      if (Math.hypot(e.nativeEvent.pageX - g.x, e.nativeEvent.pageY - g.y) < 6) return
      try { onCrop(cropBetween(g.p, local(e, true))) } catch { /* Ignore zero-area drags. */ }
    } else if (g.type === 'tap' && Math.hypot(e.nativeEvent.pageX - g.x, e.nativeEvent.pageY - g.y) < 8) {
      const p = local(e); if (p) onPoint(p)
    }
  }
  const rect = draft ? { x: Math.min(draft.a.x, draft.b.x), y: Math.min(draft.a.y, draft.b.y), width: Math.abs(draft.b.x - draft.a.x), height: Math.abs(draft.b.y - draft.a.y) } : crop
  const chosen = new Set(selected)
  const path = active => parts.filter(p => chosen.has(p.id) === active).map(p => `M${dx + p.x * scale},${dy + p.y * scale}h${p.width * scale}v${p.height * scale}h${-p.width * scale}Z`).join('')
  return <View style={styles.frame} onLayout={e => setFrame(e.nativeEvent.layout)}>
    <Image source={{ uri: source.uri }} resizeMode="stretch" pointerEvents="none" style={{ position: 'absolute', left: dx, top: dy, width: w, height: h }} />
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Path d={path(false)} fill="none" stroke={colors.textMuted} strokeWidth={1} />
      <Path d={path(true)} fill="none" stroke={colors.primary} strokeWidth={2} />
      <Rect x={dx + rect.x * w} y={dy + rect.y * h} width={rect.width * w} height={rect.height * h} fill={draft ? colors.primarySoft : 'none'} fillOpacity={0.3} stroke={colors.primary} strokeWidth={2} strokeDasharray="6 4" />
      {background && <Circle cx={dx + background.x * w} cy={dy + background.y * h} r={6} fill={colors.surface} stroke={colors.text} strokeWidth={2} />}
    </Svg>
    <View collapsable={false} style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => !working}
      onMoveShouldSetResponder={() => !working} onResponderGrant={start} onResponderStart={e => { if (e.nativeEvent.touches.length >= 2) pinch(e) }} onResponderMove={move} onResponderRelease={end}
      onResponderTerminationRequest={() => false} onResponderTerminate={() => { gesture.current = null; setDraft(null); onInteraction(false) }} />
  </View>
}
const styles = StyleSheet.create({ frame: { height: 320, overflow: 'hidden', backgroundColor: colors.surfaceMuted, marginTop: 8 } })
