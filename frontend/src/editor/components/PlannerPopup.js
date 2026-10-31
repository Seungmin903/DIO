import { useEffect, useRef } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LABEL, LINE, LINE_SOFT, TEXT } from '../templates/plannerDraw.js'
import { loadedFontFamily } from '../utils/text'
import Icon from './controls/Icon'

// 데일리 플래너 속지 위에 뜨는 고르는 창(시간 · 날짜)의 공용 모양.
// 앱 화면 색이 아니라 속지와 같은 양식을 쓴다: 흰 바탕 · 얇은 회색 테두리와 선 · #292929 / #666666 글자 · 마루부리 글꼴.
export const PLANNER_POPUP = { text: TEXT, label: LABEL, line: LINE, band: LINE_SOFT }
export const ITEM_H = 40, SHOWN = 5
const PAD = ITEM_H * Math.floor(SHOWN / 2) // 위아래를 비워 첫 · 끝 값도 가운데 줄에 올 수 있게 한다
const CARD = { width: 300, header: 40, top: 2, label: 18, wheels: ITEM_H * SHOWN, clear: 36, gap: 8, bottom: 14 }

/** 속지 글꼴. 아직 불러오기 전이면 기기 기본 글꼴 */
export const popupFont = (bold = false) => { const fontFamily = loadedFontFamily('maruburi', bold); return fontFamily ? { fontFamily, fontWeight: '400' } : { fontWeight: bold ? '700' : '400' } }

/** 위치를 정할 때 쓰는 창 크기. withClear: 지우기 줄이 있을 때. */
export const popupSize = ({ width = CARD.width } = {}) => ({ width, height: CARD.header + CARD.top + CARD.label + CARD.gap + CARD.wheels + CARD.gap + CARD.clear + CARD.bottom })

/** 속지 모양 창: 맨 윗줄에 왼쪽 자리(headerLeft, 예: 종일 토글)와 오른쪽 닫기 버튼만 두고(제목 없음) 그 아래에 내용. */
export function PlannerPopup({ label, closeLabel, onClose, headerLeft = null, style, children }) {
  const card = useRef(null)
  // 웹: 창 위의 마우스 휠은 휠(목록)만 돌리고, 뒤의 작업창(Viewport 의 휠 이동 · 확대)까지 가지 않게 막는다.
  useEffect(() => {
    const node = card.current
    if (Platform.OS !== 'web' || !node?.addEventListener) return undefined
    const stop = event => event.stopPropagation()
    node.addEventListener('wheel', stop)
    return () => node.removeEventListener('wheel', stop)
  }, [])
  return (
    <View ref={card} style={[styles.card, style]} accessibilityLabel={label} onStartShouldSetResponder={() => true}>
      <View style={styles.header}>
        {headerLeft}
        <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={styles.close}><Icon name="close" size={16} color={LABEL} /></Pressable>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  )
}

/** 칸 이름 줄: [{ name, flex }] 를 아래 휠 묶음의 폭과 맞춰 늘어놓는다. */
export function PopupLabels({ items }) {
  return <View style={styles.labels}>{items.map(({ name, flex = 1 }) => <Text key={name} style={[styles.labelText, popupFont(), { flex }]}>{name}</Text>)}</View>
}

/**
 * 돌려서 고르는 휠 묶음. 모든 휠이 같은 높이에서 시작해 고른 값이 한 줄(가운데 띠)에 나란히 놓인다.
 * children: PopupWheel 들을 flex 묶음으로 넣는다.
 */
export function PopupWheels({ children }) {
  return <View style={styles.wheels}><View pointerEvents="none" style={styles.band} />{children}</View>
}

/** 휠 한 줄 묶음(예: 시 · 분). dim: 지금 쓰지 않는 묶음은 흐리게. */
export function PopupWheelGroup({ children, flex = 1, dim = false, separator = null }) {
  return <View style={[styles.group, { flex }, dim && styles.dim]}>{children}{separator && <Text pointerEvents="none" style={[styles.separator, popupFont(true)]}>{separator}</Text>}</View>
}

/**
 * 한 칸씩 고르는 세로 휠. 고른 값은 가운데 줄에 오고, 누르면 그 값으로 맞추며 밀어 올려 멈추면 가장 가까운 값이 골라진다.
 * items: 값 목록, selected: 고른 값, text(값) → 보일 글자, label: 접근성 이름, onPick(값)
 */
export function PopupWheel({ items, selected, text, label, onPick }) {
  const scroll = useRef(null), settle = useRef(null), at = useRef(-1), placed = useRef(false)
  const index = Math.max(0, items.indexOf(selected))
  const latest = useRef({}) // 멈춘 뒤에 돌아오는 타이머가 옛 값을 보지 않게 항상 최신 값을 읽는다
  latest.current = { index, items, onPick }
  const goTo = (i, animated) => { at.current = i; scroll.current?.scrollTo({ y: i * ITEM_H, animated }) }
  // 내용 크기가 정해진 첫 순간에 한 번만 맞춘다(마운트 직후에는 기기에 따라 스크롤이 무시된다)
  const place = () => { if (!placed.current) { placed.current = true; goTo(index, false) } }
  // 값이 밖에서 바뀌면(예: 진행이 가장 짧은 5분으로 보정) 휠도 그 값으로 따라간다
  useEffect(() => { if (placed.current && at.current !== index) goTo(index, true) }, [index]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(settle.current), [])
  const onScroll = event => {
    const y = event.nativeEvent.contentOffset.y
    clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const now = latest.current, i = Math.max(0, Math.min(now.items.length - 1, Math.round(y / ITEM_H)))
      if (Math.abs(y - i * ITEM_H) > 1) goTo(i, true)
      at.current = i
      if (i !== now.index) now.onPick(now.items[i])
    }, 140)
  }
  return <ScrollView ref={scroll} style={styles.wheel} contentContainerStyle={{ paddingVertical: PAD }} showsVerticalScrollIndicator={false} nestedScrollEnabled
    scrollEventThrottle={16} snapToInterval={ITEM_H} decelerationRate="fast" onScroll={onScroll} onContentSizeChange={place}>
    {items.map((item, i) => {
      const on = item === selected, far = Math.abs(i - index)
      return <Pressable key={String(item)} accessibilityRole="button" accessibilityLabel={`${label} ${text(item)}`} accessibilityState={{ selected: on }}
        onPress={() => { goTo(i, true); if (i !== index) onPick(item) }} style={styles.item}>
        <Text style={[styles.itemText, popupFont(on), on && styles.itemTextOn, !on && far > 1 && styles.itemFar]}>{text(item)}</Text>
      </Pressable>
    })}
  </ScrollView>
}

/** 켜고 끄는 스위치(예: 종일). 속지 양식: 꺼짐은 회색 틀, 켜짐은 진한 틀에 흰 동그라미. */
export function PopupToggle({ label, on, onPress }) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on }} onPress={onPress} style={styles.toggle}>
    <Text style={[styles.toggleText, popupFont()]}>{label}</Text>
    <View style={[styles.track, on && styles.trackOn]}><View style={[styles.knob, on && styles.knobOn]} /></View>
  </Pressable>
}

/** 창 아래의 테두리 버튼 (지우기). */
export function PopupButton({ label, a11y = label, onPress }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={styles.button}><Text style={[styles.buttonText, popupFont()]}>{label}</Text></Pressable>
}

const styles = StyleSheet.create({
  card: {
    width: CARD.width, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: LINE, overflow: 'hidden',
    boxShadow: '0px 6px 18px rgba(41, 41, 41, 0.14)',
  },
  header: { height: CARD.header, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 6 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  body: { paddingHorizontal: 16, paddingTop: CARD.top, paddingBottom: CARD.bottom, gap: CARD.gap },
  // 글자 높이보다 넉넉한 줄 높이: 한글 받침이 잘리지 않게 한다
  labels: { flexDirection: 'row', gap: 10, height: CARD.label },
  labelText: { textAlign: 'center', fontSize: 11.5, lineHeight: CARD.label, color: LABEL },
  wheels: { height: CARD.wheels, flexDirection: 'row', gap: 10 },
  // 고른 값이 놓이는 가운데 줄: 모든 휠을 가로지르는 한 줄
  band: { position: 'absolute', left: -6, right: -6, top: PAD, height: ITEM_H, backgroundColor: LINE_SOFT, borderTopWidth: 1, borderBottomWidth: 1, borderColor: LINE, borderRadius: 3 },
  group: { flexDirection: 'row' },
  dim: { opacity: 0.4 },
  separator: { position: 'absolute', left: '50%', top: PAD, width: 14, marginLeft: -7, height: ITEM_H, textAlign: 'center', lineHeight: ITEM_H, fontSize: 14, color: TEXT },
  wheel: { flex: 1, ...(Platform.OS === 'web' ? { overscrollBehavior: 'contain' } : {}) }, // 마우스 휠이 휠 끝에서 뒤의 작업창까지 밀지 않게
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 14, lineHeight: 22, color: LABEL },
  itemTextOn: { fontSize: 15.5, lineHeight: 24, color: TEXT },
  itemFar: { opacity: 0.55 },
  toggle: { height: CARD.header - 4, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 8 },
  toggleText: { fontSize: 13, lineHeight: 20, color: TEXT },
  track: { width: 36, height: 20, borderRadius: 10, backgroundColor: LINE, padding: 2 },
  trackOn: { backgroundColor: TEXT },
  knob: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF' },
  knobOn: { marginLeft: 16 },
  button: { height: CARD.clear, borderRadius: 6, borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 13, lineHeight: 20, color: LABEL },
})
