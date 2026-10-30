import { useEffect, useRef, useState } from 'react'
import { AppState, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { colors, radius } from '../shared/theme'
export default function DrawingPad({ character, sample, onChange, width: penWidth, disabled, onInputActiveChange, canStartInput, onInputStart, seamless = false, guideSize = 50, guideRatio, size = 300 }) {
  const [side, setSide] = useState(size), [preview, setPreview] = useState(null)
  const guideFontSize = guideRatio == null ? guideSize : side * guideRatio
  const gesture = useRef(null), active = useRef(false), activityListener = useRef(onInputActiveChange)
  activityListener.current = onInputActiveChange
  const setActive = value => {
    if (active.current === value) return
    active.current = value; activityListener.current?.(value)
  }
  useEffect(() => {
    gesture.current = null; setPreview(null); setActive(false)
    return () => { gesture.current = null; setActive(false) }
  }, [character, disabled])
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') end(true) })
    return () => subscription.remove()
  }, [])
  const point = e => {
    const event = e.nativeEvent, x = event.locationX / side * 1024, y = event.locationY / side * 1024
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x: Math.max(0, Math.min(1024, x)), y: Math.max(0, Math.min(1024, y)), pressure: event.pointerType === 'pen' && Number.isFinite(event.pressure) ? event.pressure : null, time: Date.now() - (gesture.current?.started ?? Date.now()) }
  }
  const end = cancelled => {
    const g = gesture.current; gesture.current = null; setPreview(null); setActive(false)
    if (!cancelled && g?.points.length) onChange({ coordinateSize: 1024, strokes: [...(sample?.strokes ?? []), { width: g.width, points: g.points }] })
  }
  const strokes = [...(sample?.strokes ?? []), ...(preview ? [preview] : [])]
  return <View style={[s.pad, seamless && s.seamless]} onLayout={e => { const next = e.nativeEvent.layout.width; if (gesture.current && Math.abs(next - side) > .5) end(true); setSide(next) }}>
    <View pointerEvents="none" style={s.guideWrap}><Text allowFontScaling={false} style={[s.guide, { fontSize: guideFontSize, lineHeight: guideFontSize }]}>{character}</Text></View>
    <View accessibilityLabel={`${character} 손글씨 입력칸`} style={{ width: '100%', aspectRatio: 1, touchAction: 'none' }}
      onTouchStart={e => { if (gesture.current && e.nativeEvent.touches?.length > 1) end(true) }}
      onTouchEnd={e => {
        const event = e.nativeEvent, id = gesture.current?.identifier
        if (!event.touches?.length || (id != null && event.changedTouches?.some(touch => touch.identifier === id))) end(false)
      }} onTouchCancel={() => end(true)}
      onStartShouldSetResponder={() => !disabled && (canStartInput?.() ?? true)} onMoveShouldSetResponder={() => !disabled && (canStartInput?.() ?? true)}
      onResponderGrant={e => { if (disabled || e.nativeEvent.touches?.length > 1) return end(true); const p = point(e); if (!p || onInputStart?.() === false) return end(true); setActive(true); gesture.current = { width: penWidth, points: [p], started: Date.now(), identifier: e.nativeEvent.identifier ?? e.nativeEvent.changedTouches?.[0]?.identifier }; setPreview({ ...gesture.current }) }}
      onResponderMove={e => { const g = gesture.current; if (!g) return; if (e.nativeEvent.touches?.length > 1) return end(true); const p = point(e); if (p && Math.hypot(p.x - g.points.at(-1).x, p.y - g.points.at(-1).y) >= .7 && g.points.length < 5000) { g.points.push(p); setPreview({ ...g, points: [...g.points] }) } }}
      onResponderRelease={() => end(false)} onResponderTerminate={() => end(true)} onResponderTerminationRequest={() => !gesture.current} onShouldBlockNativeResponder={() => Boolean(gesture.current)}>
      <Svg pointerEvents="none" width="100%" height="100%" viewBox="0 0 1024 1024">
        {strokes.map((stroke, i) => stroke.points.length === 1 ? <Circle key={i} cx={stroke.points[0].x} cy={stroke.points[0].y} r={stroke.width / 2} fill="#111" /> : <Path key={i} d={stroke.points.map((p, j) => `${j ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} fill="none" stroke="#111" strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}
      </Svg>
    </View>
  </View>
}


const s = StyleSheet.create({pad:{width:'100%',aspectRatio:1,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.surface,overflow:'hidden'},seamless:{borderWidth:0,borderRadius:0},guideWrap:{...StyleSheet.absoluteFillObject,alignItems:'center',justifyContent:'center'},guide:{textAlign:'center',textAlignVertical:'center',includeFontPadding:false,fontSize:50,color:colors.border}})
