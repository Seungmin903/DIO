import { useEffect, useRef, useState } from 'react'
import { AppState, Dimensions, Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { colors, shadow } from '../../../shared/theme'
import { captureScreenSampler } from '../../utils/eyedropper'
import EditorModal from './EditorModal'
import EyedropperIcon from './EyedropperIcon'
import Icon from './Icon'

const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

// 돋보기: 손가락에 가려 색만 보여 주던 링 대신, 찍어 둔 화면을 3배로 키워 손가락 둘레를 보여 준다(사용자 2026-11-02).
// 지름 104, 테두리 8(위 반쪽 = 지금 집은 색, 아래 반쪽 = 원래 색), 가운데 조준 칸. 손가락 중심에서 96 위(공간이 없으면 아래), 가장자리 12 안쪽
const LENS = { size: 104, ring: 8, zoom: 3, above: 96, below: 84, edge: 12, aim: 10 }

/**
 * 스포이드 덮개(앱). 화면을 한 번 찍어 두고, 손가락을 대고 끄는 동안 돋보기에 그 둘레를 확대해 보여 준다. 떼면 onPick(색).
 * 위쪽 가운데 알약(스포이드 아이콘 + 지금 집은 색 + 닫기)으로 스포이드 중임을 알린다. 글 안내는 두지 않는다(디자인 가이드 §8).
 * original: 원래 색(돋보기 아래 반쪽 · 알약 처음 색), onCancel()
 */
export default function EyedropperOverlay({ original, onPick, onCancel }) {
  const window = useWindowDimensions()
  const sampler = useRef(null), latestTouch = useRef(null)
  const [shot, setShot] = useState(null) // 찍어 둔 화면 주소(돋보기)
  const [touch, setTouch] = useState(null) // { x, y, color }
  useEffect(() => {
    let alive = true
    // 색 창이 사라진 화면을 찍는다(덮개는 투명이라 찍혀도 보이지 않는다)
    nextFrame().then(captureScreenSampler).then((result) => {
      if (!alive) { result?.release(); return }
      if (!result) { onCancel(); return }
      sampler.current = result
      setShot(result.uri)
    }).catch(() => { if (alive) onCancel() })
    const state = AppState.addEventListener('change', value => { if (value !== 'active') onCancel() })
    const size = Dimensions.addEventListener('change', onCancel)
    return () => { state.remove(); size.remove(); alive = false; sampler.current?.release(); sampler.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const read = ({ nativeEvent: { pageX, pageY } }) => {
    const color = sampler.current?.colorAt(pageX, pageY)
    latestTouch.current = color ? {x:pageX,y:pageY,color} : null
    setTouch(latestTouch.current)
    return color
  }
  const shown = touch?.color ?? original
  const half = LENS.size / 2
  const lens = touch && (() => {
    const up = touch.y - LENS.above - half
    const top = up >= LENS.edge ? up : Math.min(window.height - LENS.edge - LENS.size, touch.y + LENS.below - half)
    return { left: Math.min(window.width - LENS.edge - LENS.size, Math.max(LENS.edge, touch.x - half)), top }
  })()
  const inner = LENS.size - LENS.ring * 2
  return (
    <EditorModal transparent animationType="none" statusBarTranslucent onRequestClose={onCancel}>
      <View
        testID={shot ? "screen-eyedropper-ready" : "screen-eyedropper-preparing"}
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => Boolean(shot)}
        onMoveShouldSetResponder={() => Boolean(shot)}
        onResponderGrant={read}
        onResponderMove={read}
        onResponderRelease={event => { const color = read(event); if (color) onPick(color); else onCancel() }}
        onResponderTerminate={onCancel}
        accessible
        accessibilityLabel="스포이드"
        accessibilityActions={[{ name: 'escape' }]}
        onAccessibilityEscape={onCancel}
      />
      {shot && <View style={styles.pill} accessibilityLiveRegion="polite">
        <EyedropperIcon size={20} color={colors.text} />
        <View style={[styles.pillColor, { backgroundColor: shown }]} />
        <View style={styles.pillDivider} />
        <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button" accessibilityLabel="스포이드 취소" style={styles.pillClose}>
          <Icon name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>}
      {touch && shot && (
        <View pointerEvents="none" style={[styles.lens, lens]}>
          {/* 테두리: 위 반쪽 새 색 · 아래 반쪽 원래 색 */}
          <View style={[styles.ringHalf, { backgroundColor: touch.color }]} />
          <View style={[styles.ringHalf, { backgroundColor: original }]} />
          <View style={[styles.window, { width: inner, height: inner, borderRadius: inner / 2, left: LENS.ring, top: LENS.ring }]}>
            <Image source={{ uri: shot }} resizeMode="stretch" style={{ position: 'absolute', width: window.width * LENS.zoom, height: window.height * LENS.zoom,
              left: inner / 2 - touch.x * LENS.zoom, top: inner / 2 - touch.y * LENS.zoom }} />
            <View style={[styles.aim, { left: inner / 2 - LENS.aim / 2, top: inner / 2 - LENS.aim / 2 }]} />
          </View>
        </View>
      )}
    </EditorModal>
  )
}

const styles = StyleSheet.create({
  // 상단 알약 112×40, 안전 영역 위에서 12 아래 가운데
  pill: {
    position: 'absolute', top: 12, alignSelf: 'center', width: 112, height: 40, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingLeft: 14, paddingRight: 4, borderRadius: 20, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.cardBorder, ...shadow.card,
  },
  pillColor: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: colors.border },
  pillDivider: { width: 1, height: 18, backgroundColor: colors.cardBorder },
  pillClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  lens: { position: 'absolute', width: LENS.size, height: LENS.size, borderRadius: LENS.size / 2, overflow: 'hidden', ...shadow.card },
  ringHalf: { flex: 1 },
  window: { position: 'absolute', overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  // 조준 칸: 흰 테두리 + 남색 바깥선으로 어떤 바탕에서도 보인다
  aim: { position: 'absolute', width: LENS.aim, height: LENS.aim, borderWidth: 1.5, borderColor: colors.surface, boxShadow: '0px 0px 0px 1px rgba(28, 28, 28, 0.75)' },
})
