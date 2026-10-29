import { createContext, useMemo, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Icon from '../../editor/components/controls/Icon'
import { colors, DISABLED_OPACITY, shadow } from '../../shared/theme'

/** 옵션 패널 스크롤: 펼친 요소 줄이 화면 밖이면 보이도록 끌어온다 (ElementRow 가 쓴다) */
export const PanelScroll = createContext(null)

/**
 * 새 다이어리 · 다이어리 수정이 함께 쓰는 틀 (2안 · 구역 카드).
 * 위 막대(취소 · 제목 · 주요 버튼) | 왼쪽 큰 구역 카드 | 가운데 미리보기 | 오른쪽 옵션.
 * sheet(폰)에서는 구역 카드를 위쪽 가로 줄로, 미리보기를 그 아래 낮은 판으로, 옵션을 남은 높이에 둔다.
 */
export default function Workbench({ title, actionLabel, onCancel, onSubmit, submitDisabled = false, cancelDisabled = false,
  sections, section, onSection, sheet = false, bottomInset = 0, onStageLayout, stage, panel, foot, panelLocked = false }) {
  const scrollRef = useRef(null), contentRef = useRef(null)
  const view = useRef({ y: 0, height: 0 })
  const scroll = useMemo(() => ({
    reveal(node) {
      try {
        node?.measureLayout(contentRef.current, (x, y, w, h) => {
          const { y: top, height } = view.current
          if (y >= top && y + Math.min(h, height - 24) <= top + height) return
          scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true })
        }, () => {})
      } catch { /* 잴 수 없으면 그대로 둔다 */ }
    },
  }), [])
  const cards = sections.map(item => {
    const on = item.id === section
    return <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={`${item.title}, ${item.summary}`} accessibilityState={{ selected: on }}
      onPress={() => onSection(item.id)} style={({ pressed }) => [styles.card, sheet && styles.cardSheet, on && styles.cardOn, pressed && styles.pressed]}>
      <View style={[styles.cardIcon, sheet && styles.cardIconSheet]}><Icon name={item.icon} size={sheet ? 18 : 22} color={on ? colors.primaryStrong : colors.text} /></View>
      <Text numberOfLines={1} style={styles.cardTitle}>{item.title}</Text>
    </Pressable>
  })
  return <>
    <View style={styles.topbar}>
      <Pressable accessibilityRole="button" accessibilityLabel="취소" disabled={cancelDisabled} onPress={onCancel} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
        <Text style={styles.cancelText}>취소</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.topTitle}>{title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} accessibilityState={{ disabled: submitDisabled }} disabled={submitDisabled} onPress={onSubmit}
        style={({ pressed }) => [styles.submit, sheet && styles.submitSheet, pressed && styles.pressed, submitDisabled && { opacity: DISABLED_OPACITY }]}>
        <Text style={styles.submitText}>{actionLabel}</Text>
      </Pressable>
    </View>
    <View style={[styles.main, sheet && styles.mainSheet]}>
      {sheet ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardsSheetScroll} contentContainerStyle={styles.cardsSheet}>{cards}</ScrollView>
        : <ScrollView style={styles.cards} contentContainerStyle={styles.cardsBody}>{cards}</ScrollView>}
      <View style={[styles.stage, sheet && styles.stageSheet]} onLayout={event => { const { width, height } = event.nativeEvent.layout; onStageLayout({ width, height }) }}>
        {stage}
      </View>
      <View style={[styles.panel, sheet && styles.panelSheet]}>
        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" scrollEventThrottle={64}
          onScroll={event => { view.current.y = event.nativeEvent.contentOffset.y }} onLayout={event => { view.current.height = event.nativeEvent.layout.height }}
          contentContainerStyle={[styles.panelBody, sheet && !foot && { paddingBottom: 16 + bottomInset }]}>
          <View ref={contentRef} collapsable={false} pointerEvents={panelLocked ? 'none' : 'auto'}>
            <PanelScroll.Provider value={scroll}>{panel}</PanelScroll.Provider>
          </View>
        </ScrollView>
        {foot ? <View style={[styles.panelFoot, sheet && { paddingBottom: 12 + bottomInset }]}>{foot}</View> : null}
      </View>
    </View>
  </>
}

/** 가운데 판의 알약 설명 */
export function StagePill({ children }) {
  return <Text style={styles.pill}>{children}</Text>
}

/** maxWidth × maxHeight 안에 ratio(가로/세로)를 지키며 가장 크게 */
export function fit(ratio, maxWidth, maxHeight) {
  const width = Math.max(0, Math.min(maxWidth, maxHeight * ratio))
  return { width, height: width / ratio }
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  topbar: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  cancel: { minWidth: 60, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  cancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  topTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 16, fontWeight: '800' },
  submit: { minWidth: 120, height: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.primaryStrong },
  submitSheet: { minWidth: 72 },
  submitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  main: { flex: 1, minHeight: 0, flexDirection: 'row', paddingTop: 12 },
  mainSheet: { flexDirection: 'column', paddingTop: 0 },
  cards: { width: 200, flexGrow: 0 },
  cardsBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  cardsSheetScroll: { flexGrow: 0 },
  cardsSheet: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingRight: 20, borderRadius: 18, borderWidth: 2, borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,.55)' },
  cardSheet: { minHeight: 44, paddingVertical: 6, paddingHorizontal: 10, gap: 8, borderRadius: 999 },
  cardOn: { borderColor: colors.primary, backgroundColor: colors.surface },
  cardIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  cardIconSheet: { width: 30, height: 30, borderRadius: 15 },
  cardTitle: { flexShrink: 1, color: colors.text, fontSize: 14.5, fontWeight: '800' },
  stage: { flex: 1, minWidth: 0, marginRight: 12, marginBottom: 12, borderRadius: 24, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#E9EDF4' },
  stageSheet: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', height: 240, marginHorizontal: 16, marginBottom: 0, borderRadius: 20, gap: 8 },
  panel: { width: 420, borderTopLeftRadius: 24, backgroundColor: colors.surface, ...shadow.card, shadowOpacity: 0.06 },
  panelSheet: { flex: 1, width: '100%', marginTop: 12, borderTopRightRadius: 24 },
  panelBody: { padding: 16 },
  panelFoot: { gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  pill: { overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, color: colors.text, fontSize: 12.5, fontWeight: '700', backgroundColor: 'rgba(255,255,255,.85)' },
})
