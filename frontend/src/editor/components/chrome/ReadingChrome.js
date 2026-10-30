import { useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, shadow, DISABLED_OPACITY } from '../../../shared/theme'
import BrandLogo from '../../../shared/BrandLogo'
import Icon from '../controls/Icon'
import { pageFromProgress } from '../../utils/readingGestures.js'
import { createPageRepeat, isGesturePagePress } from '../../utils/pageRepeat.js'

export const READING_PADDING = { top: 64, bottom: 64, side: 12 }

function Action({ icon, label, onPress, disabled = false, ...pressProps }) {
  return <Pressable {...pressProps} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed, disabled && styles.disabled]}>
    <Icon name={icon} size={20} />
  </Pressable>
}

export function PageTurnAction({ direction, index, count, onSelect }) {
  const latest = useRef(null), repeat = useRef(null)
  latest.current = { index, count, onSelect }
  if (!repeat.current) repeat.current = createPageRepeat(() => {
    const state = latest.current
    const next = state.index + direction
    if (next < 0 || next >= state.count) return false
    state.index = next
    state.onSelect(next)
    return direction < 0 ? next > 0 : next < state.count - 1
  })
  const disabled = count <= 1 || (direction < 0 ? index <= 0 : index >= count - 1)
  useEffect(() => { if (disabled) repeat.current.cancel() }, [disabled])
  useEffect(() => {
    const cancel = () => repeat.current.cancel()
    const subscription = AppState?.addEventListener('change', state => { if (state !== 'active') cancel() })
    const browserWindow = typeof window === 'undefined' ? null : window
    browserWindow?.addEventListener?.('blur', cancel)
    return () => { subscription?.remove(); browserWindow?.removeEventListener?.('blur', cancel); cancel() }
  }, [])
  return <Action icon={direction < 0 ? 'chevronLeft' : 'chevronRight'} label={direction < 0 ? '이전 페이지' : '다음 페이지'}
    disabled={disabled} accessibilityHint="누르고 있으면 페이지를 빠르게 넘겨요."
    onPressIn={() => repeat.current.start()} onPressOut={() => repeat.current.release()}
    onTouchCancel={() => repeat.current.cancel()} onPointerCancel={() => repeat.current.cancel()}
    onPress={event => repeat.current.press({ gesture: isGesturePagePress(event) })} />
}

export function ReadingModeControls({ reading, canEdit, onFit, onToggle, controlsRef, onLayout, bottomInset = 0 }) {
  return <View ref={controlsRef} onLayout={onLayout} style={[styles.modeControls, { bottom: 12 + bottomInset }]}>
    <Action icon="fit" label="화면에 맞춤" onPress={onFit} />
    {canEdit ? <Action icon={reading ? 'edit' : 'eye'} label={reading ? '편집 모드로 전환' : '읽기 모드로 전환'} onPress={onToggle} /> : <View style={styles.action} />}
  </View>
}

export function ReadingHeader({ title, onHome }) {
  return <View style={styles.header}>
    <Pressable onPress={onHome} accessibilityRole="button" accessibilityLabel="다이어리 홈" style={({ pressed }) => [styles.home, pressed && styles.pressed]}>
      <Icon name="chevronLeft" size={20} /><BrandLogo size={24} />
    </Pressable>
    <Text numberOfLines={1} style={styles.title}>{title}</Text>
    <View style={styles.home} />
  </View>
}

export function ReadingNavigation({ index, count, onSelect, canEdit, onFit, onToggle, controlsRef, onLayout }) {
  const [preview, setPreview] = useState(null)
  const width = useRef(1), origin = useRef(null), draft = useRef(null)
  useEffect(() => { draft.current = null; setPreview(null) }, [index, count])
  const disabled = count <= 1
  const update = x => {
    const next = pageFromProgress(x, width.current, count)
    draft.current = next; setPreview(next)
  }
  const cancel = () => { draft.current = null; origin.current = null; setPreview(null) }
  const shown = preview ?? index
  const ratio = count > 1 ? shown / (count - 1) : 0
  return <View ref={controlsRef} onLayout={onLayout} testID="reading-bottom-menu" style={styles.navigation}>
    <Text accessibilityLabel={`현재 ${index + 1}페이지, 전체 ${count}페이지`} style={styles.pageNumber}>{shown + 1} / {count}</Text>
    <View style={styles.pager}>
      <PageTurnAction direction={-1} index={index} count={count} onSelect={onSelect} />
      <View accessibilityRole="adjustable" accessibilityLabel="페이지 이동" accessibilityState={{ disabled }}
        accessibilityValue={{ min: 1, max: count, now: shown + 1, text: `${shown + 1} / ${count}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={event => { if (!disabled) onSelect(Math.max(0, Math.min(count - 1, index + (event.nativeEvent.actionName === 'increment' ? 1 : -1)))) }}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={event => {
          const changes = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: count - 1 }
          if (!disabled && event.key in changes) { event.preventDefault(); onSelect(Math.max(0, Math.min(count - 1, changes[event.key]))) }
        }}
        onLayout={event => { width.current = Math.max(1, event.nativeEvent.layout.width) }}
        onStartShouldSetResponder={() => !disabled}
        onResponderTerminationRequest={() => true}
        onResponderGrant={event => { origin.current = { pageX: event.nativeEvent.pageX, x: event.nativeEvent.locationX }; update(origin.current.x) }}
        onResponderMove={event => { if (origin.current) update(origin.current.x + event.nativeEvent.pageX - origin.current.pageX) }}
        onResponderRelease={() => { const next = draft.current; cancel(); if (next != null) onSelect(next) }}
        onResponderTerminate={cancel}
        style={[styles.track, disabled && styles.disabled]}>
        <View pointerEvents="none" style={styles.trackLine} />
        <View pointerEvents="none" style={[styles.fill, { width: `${ratio * 100}%` }]} />
        <View pointerEvents="none" style={[styles.thumb, { left: `${ratio * 100}%` }]} />
      </View>
      <PageTurnAction direction={1} index={index} count={count} onSelect={onSelect} />
    </View>
    <View style={styles.readingActions}>
      <Action icon="fit" label="화면에 맞춤" onPress={onFit} />
      {canEdit && <Action icon="edit" label="편집 모드로 전환" onPress={onToggle} />}
    </View>
  </View>
}

const styles = StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0, height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, backgroundColor: colors.surface, zIndex: 40 },
  home: { width: 72, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  title: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 13, fontWeight: '700', color: colors.text },
  // 위 헤더처럼 화면 끝에 붙인다(떠 있지 않게). 아래 모서리는 화면 모서리에 맡기고 위쪽만 둥글게 둔다.
  navigation: { position: 'absolute', bottom: 0, left: 0, right: 0, minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 12, backgroundColor: colors.surface, borderTopLeftRadius: 14, borderTopRightRadius: 14, zIndex: 25 },
  pageNumber: { width: 58, fontSize: 11, fontWeight: '700', color: colors.text, textAlign: 'center', fontVariant: ['tabular-nums'] },
  pager: { flex: 1, minWidth: 0, maxWidth: 520, flexDirection: 'row', alignItems: 'center', marginHorizontal: 'auto' },
  readingActions: { flexDirection: 'row', marginLeft: 4, flexShrink: 0 },
  modeControls: { position: 'absolute', right: 12, bottom: 12, height: 52, padding: 4, flexDirection: 'row', alignItems: 'center', borderRadius: 14, backgroundColor: colors.surface, zIndex: 30, ...shadow.card },
  action: { width: 44, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 }, disabled: { opacity: DISABLED_OPACITY },
  track: { flex: 1, minWidth: 8, height: 44, justifyContent: 'center', marginHorizontal: 8, touchAction: 'none' },
  trackLine: { height: 4, borderRadius: 2, backgroundColor: colors.primarySoft },
  fill: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: colors.primary },
  thumb: { position: 'absolute', width: 20, height: 20, marginLeft: -10, borderRadius: 10, borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.surface },
})
