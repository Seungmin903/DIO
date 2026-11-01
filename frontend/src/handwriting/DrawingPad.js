import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { colors, radius } from '../shared/theme'

const frame = globalThis.requestAnimationFrame?.bind(globalThis) ?? (fn => setTimeout(fn, 16))
const cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis) ?? clearTimeout
const strokePath = points => points.map((p, j) => `${j ? 'L' : 'M'}${p.x},${p.y}`).join(' ')

// 펜 반영 속도: 이미 쓴 획(아래 층)은 그 칸의 획이 바뀔 때만 다시 그리고, 지금 쓰는 획(위 층)만 움직임마다 그린다.
// 지금 쓰는 획의 경로 글자는 점을 이어 붙이기만 하고, 화면 반영은 한 프레임에 한 번으로 묶는다.
function DrawingPad({ character, sample, onChange, width: penWidth, disabled, onInputActiveChange, canStartInput, onInputStart, seamless = false, guideSize = 50, guideRatio, size = 300 }) {
  const [side, setSide] = useState(size), [preview, setPreview] = useState(null)
  const guideFontSize = guideRatio == null ? guideSize : side * guideRatio
  const gesture = useRef(null), active = useRef(false), activityListener = useRef(onInputActiveChange), pending = useRef(null)
  activityListener.current = onInputActiveChange
  const setActive = value => {
    if (active.current === value) return
    active.current = value; activityListener.current?.(value)
  }
  const show = () => {
    if (pending.current != null) return
    pending.current = frame(() => { pending.current = null; const g = gesture.current; setPreview(g ? { width: g.width, d: g.d, point: g.points.length === 1 ? g.points[0] : null } : null) })
  }
  const stopFrame = () => { if (pending.current != null) { cancelFrame(pending.current); pending.current = null } }
  useEffect(() => {
    gesture.current = null; stopFrame(); setPreview(null); setActive(false)
    return () => { gesture.current = null; stopFrame(); setActive(false) }
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
    const g = gesture.current; gesture.current = null; stopFrame(); setPreview(null); setActive(false)
    if (!cancelled && g?.points.length) onChange({ coordinateSize: 1024, strokes: [...(sample?.strokes ?? []), { width: g.width, points: g.points }] })
  }
  // 화면 반 픽셀보다 가까운 점은 버린다(1024 좌표로 0.7 이상, 칸이 작을수록 간격이 넓어진다)
  const minGap = Math.max(.7, 512 / Math.max(1, side))
  const committed = useMemo(() => (sample?.strokes ?? []).map((stroke, i) => stroke.points.length === 1
    ? <Circle key={i} cx={stroke.points[0].x} cy={stroke.points[0].y} r={stroke.width / 2} fill="#111" />
    : <Path key={i} d={strokePath(stroke.points)} fill="none" stroke="#111" strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />), [sample])
  return <View style={[s.pad, seamless && s.seamless]} onLayout={e => { const next = e.nativeEvent.layout.width; if (gesture.current && Math.abs(next - side) > .5) end(true); setSide(next) }}>
    <View pointerEvents="none" style={s.guideWrap}><Text allowFontScaling={false} style={[s.guide, { fontSize: guideFontSize, lineHeight: guideFontSize }]}>{character}</Text></View>
    <View accessibilityLabel={`${character} 손글씨 입력칸`} style={{ width: '100%', aspectRatio: 1, touchAction: 'none' }}
      onTouchStart={e => { if (gesture.current && e.nativeEvent.touches?.length > 1) end(true) }}
      onTouchEnd={e => {
        const event = e.nativeEvent, id = gesture.current?.identifier
        if (!event.touches?.length || (id != null && event.changedTouches?.some(touch => touch.identifier === id))) end(false)
      }} onTouchCancel={() => end(true)}
      onStartShouldSetResponder={() => !disabled && (canStartInput?.() ?? true)} onMoveShouldSetResponder={() => !disabled && (canStartInput?.() ?? true)}
      onResponderGrant={e => { if (disabled || e.nativeEvent.touches?.length > 1) return end(true); const p = point(e); if (!p || onInputStart?.() === false) return end(true); setActive(true); gesture.current = { width: penWidth, points: [p], d: `M${p.x},${p.y}`, started: Date.now(), identifier: e.nativeEvent.identifier ?? e.nativeEvent.changedTouches?.[0]?.identifier }; show() }}
      onResponderMove={e => { const g = gesture.current; if (!g) return; if (e.nativeEvent.touches?.length > 1) return end(true); const p = point(e); if (p && Math.hypot(p.x - g.points.at(-1).x, p.y - g.points.at(-1).y) >= minGap && g.points.length < 5000) { g.points.push(p); g.d += ` L${p.x},${p.y}`; show() } }}
      onResponderRelease={() => end(false)} onResponderTerminate={() => end(true)} onResponderTerminationRequest={() => !gesture.current} onShouldBlockNativeResponder={() => Boolean(gesture.current)}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 1024 1024">{committed}</Svg>
      {preview && <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 1024 1024">
        {preview.point ? <Circle cx={preview.point.x} cy={preview.point.y} r={preview.width / 2} fill="#111" />
          : <Path d={preview.d} fill="none" stroke="#111" strokeWidth={preview.width} strokeLinecap="round" strokeLinejoin="round" />}
      </Svg>}
    </View>
  </View>
}

// 획 하나를 끝낼 때 원고지 36칸이 모두 다시 그려지지 않게, 함수가 아닌 값(글자 · 획 · 굵기 · 막힘 · 크기)이 같으면 그대로 둔다.
// 함수 속성은 입력 화면의 ref · 최신 값을 읽으므로 이전 것을 계속 써도 된다.
const sameProps = (a, b) => Object.keys({ ...a, ...b }).every(key => typeof a[key] === 'function' || a[key] === b[key])
export default memo(DrawingPad, sameProps)

const s = StyleSheet.create({pad:{width:'100%',aspectRatio:1,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.surface,overflow:'hidden'},seamless:{borderWidth:0,borderRadius:0},guideWrap:{...StyleSheet.absoluteFill,alignItems:'center',justifyContent:'center'},guide:{textAlign:'center',textAlignVertical:'center',includeFontPadding:false,fontSize:50,color:colors.border}})
