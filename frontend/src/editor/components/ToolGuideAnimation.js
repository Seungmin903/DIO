import { useEffect, useId, useState } from 'react'
import { AccessibilityInfo, AppState, Platform, StyleSheet, View } from 'react-native'
import Svg, { Circle, Defs, G, Mask, Path, Rect } from 'react-native-svg'
import { colors, radius } from '../../shared/theme'
import { GUIDE_LABELS, GUIDE_STROKE_PATHS, toolGuideFrame } from '../utils/toolGuide.js'

/** 설정 패널이 보일 때만 재생하는 시청용 예시. */
export default function ToolGuideAnimation({ mode }) {
  const maskId = `tool-guide-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [frame, setFrame] = useState(() => toolGuideFrame(mode, 0, true))
  useEffect(() => {
    let disposed = false, request = null, start = null, last = -Infinity
    // 설정 확인 전에는 정지한다. 늦은 초기 응답이 변경 이벤트를 덮어쓰지 않도록 한다.
    let reduced = true, motionRevision = 0
    let appActive = !AppState.currentState || AppState.currentState === 'active'
    const web = Platform.OS === 'web' && typeof document !== 'undefined'
    const media = web && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    const visible = () => appActive && (!web || !document.hidden)
    const stop = () => { if (request !== null) cancelAnimationFrame(request); request = null }
    const tick = now => {
      if (disposed || reduced || !visible()) { stop(); return }
      start ??= now
      // 작은 SVG 내부만 30fps로 갱신하고 편집기 전체의 재렌더링을 피한다.
      if (now - last >= 1000 / 30) { last = now; setFrame(toolGuideFrame(mode, now - start)) }
      request = requestAnimationFrame(tick)
    }
    const restart = () => {
      stop(); start = null; last = -Infinity
      if (disposed) return
      setFrame(toolGuideFrame(mode, 0, reduced))
      if (!reduced && visible()) request = requestAnimationFrame(tick)
    }
    const motionChanged = value => { motionRevision++; reduced = value; restart() }
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', motionChanged)
    const app = AppState.addEventListener('change', value => { appActive = value === 'active'; restart() })
    const visibilityChanged = () => restart()
    const mediaChanged = event => motionChanged(event.matches)
    if (web) document.addEventListener('visibilitychange', visibilityChanged)
    media?.addEventListener('change', mediaChanged)
    if (media) motionChanged(media.matches)
    else {
      const revision = motionRevision
      AccessibilityInfo.isReduceMotionEnabled().then(value => {
        if (!disposed && revision === motionRevision) { reduced = value; restart() }
      }).catch(() => { /* 설정 조회 실패 시 정지 결과를 유지한다. */ })
    }
    restart()
    return () => {
      disposed = true; stop(); motion.remove(); app.remove()
      if (web) document.removeEventListener('visibilitychange', visibilityChanged)
      media?.removeEventListener('change', mediaChanged)
    }
  }, [mode])
  const eraser = mode === 'stroke' || mode === 'area'
  return <View style={styles.preview} pointerEvents="none" accessible accessibilityRole="image" accessibilityLabel={GUIDE_LABELS[mode]} testID={`tool-guide-${mode}`}>
    <Svg width="100%" height="100%" viewBox="0 0 320 160" accessible={false} aria-hidden>
      {eraser ? <>
        <Defs><Mask id={maskId} x="0" y="0" width="320" height="160" maskUnits="userSpaceOnUse">
          <Rect width="320" height="160" fill="white" />
          {frame.cut ? <Path d={frame.cut} stroke="black" strokeWidth={24} strokeLinecap="round" fill="none" /> : null}
        </Mask></Defs>
        <G mask={`url(#${maskId})`}>
          {GUIDE_STROKE_PATHS.map((d, i) => <Path key={i} d={d} fill="none" stroke={i === 1 ? colors.secondary : colors.primary} strokeWidth={6} strokeLinecap="round" opacity={frame.hiddenStrokes[i] ? 0 : 1} />)}
        </G>
      </> : <>
        <Rect x={64} y={60} width={60} height={40} rx={9} fill={colors.primarySoft} />
        <Circle cx={169} cy={92} r={22} fill={colors.secondary} />
        <Path d="M235 37 242 51 257 53 246 64 249 79 235 72 221 79 224 64 213 53 228 51Z" fill="#E8AF45" />
        {frame.selection ? <Path d={frame.selection} stroke={colors.primary} strokeWidth={1.5} strokeDasharray="6 4" fill={frame.done ? colors.primarySoft : 'none'} /> : null}
      </>}
      {frame.cursorVisible && <G transform={`translate(${frame.cursor.x} ${frame.cursor.y})`}>
        <Circle r={eraser ? 12 : 5} fill={colors.surface} fillOpacity={0.8} stroke={colors.primary} strokeWidth={1.5} />
        {eraser && <Path d="m-5 1 6-6 4 4-6 6Z" fill={colors.primarySoft} stroke={colors.primary} strokeWidth={1} />}
      </G>}
    </Svg>
  </View>
}
const styles = StyleSheet.create({
  preview: { width: '100%', height: 120, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
})
