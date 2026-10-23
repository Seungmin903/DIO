import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { configuredMonthPageIds } from '../../editor/templates/creation.js'
import { isUndated } from '../../editor/templates/undated.js'
import { getTemplate } from '../../editor/templates/catalog.js'
import { TemplatePreview } from './DiaryTemplateSettings'
import AppIcon from '../../shared/AppIcon'
import { colors } from '../../shared/theme'

export default function DiaryMonthPreview({ config, appearance, compact = false }) {
  const [month, setMonth] = useState(1)
  const [expanded, setExpanded] = useState(false)
  const [contentWidth, setContentWidth] = useState(228)
  const undated = isUndated(config)
  const ids = useMemo(() => configuredMonthPageIds(config, month), [config, month])
  const tileWidth = Math.max(1, contentWidth)
  return <View style={[s.container, compact && s.compact]}>
    <View style={s.heading}>
      <Text style={s.title}>한 달 구성 미리보기</Text>
      {compact && <Pressable accessibilityRole="button" accessibilityLabel={`한 달 구성 미리보기 ${expanded ? '접기' : '펼치기'}`} accessibilityState={{ expanded }} aria-expanded={expanded}
        onPress={() => setExpanded(value => !value)} style={s.toggle}><Text style={s.toggleText}>{expanded ? '접기' : '펼치기'}</Text></Pressable>}
    </View>
    {(!compact || expanded) && <>
      <View style={s.monthRow}>
        {!undated && <Pressable accessibilityRole="button" accessibilityLabel="이전 달 구성" disabled={month === 1} onPress={() => setMonth(value => value - 1)} style={[s.arrow, month === 1 && s.disabled]}>
          <AppIcon name="chevron-left" size={18} />
        </Pressable>}
        <Text accessibilityLiveRegion="polite" style={s.month}>{undated ? '만년형 한 달' : `${month}월`} · {ids.length}페이지</Text>
        {!undated && <Pressable accessibilityRole="button" accessibilityLabel="다음 달 구성" disabled={month === 12} onPress={() => setMonth(value => value + 1)} style={[s.arrow, month === 12 && s.disabled]}>
          <AppIcon name="chevron-right" size={18} />
        </Pressable>}
      </View>
      <Text style={s.hint}>실제로 들어갈 순서예요. 첫 장 표지는 별도로 포함돼요.</Text>
      <ScrollView nestedScrollEnabled style={[s.scroll, compact && { flex: undefined, height: 320 }]} contentContainerStyle={s.pages} showsVerticalScrollIndicator>
        <View onLayout={event => setContentWidth(event.nativeEvent.layout.width)} style={s.list}>
          {ids.map((id, index) => <View key={`${id}-${index}`} style={{ width: tileWidth, gap: 5 }}>
            <View pointerEvents="none"><TemplatePreview assetId={id} width={tileWidth} appearance={appearance} /></View>
            <Text style={s.label}>{index + 1}. {getTemplate(id).name}</Text>
          </View>)}
        </View>
      </ScrollView>
    </>}
  </View>
}

const s = StyleSheet.create({
  container: { width: '100%', flex: 1, minHeight: 0, gap: 10 },
  compact: { flex: undefined, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginBottom: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { color: colors.text, fontSize: 13, fontWeight: '700' },
  arrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surface },
  disabled: { opacity: 0.3 },
  hint: { fontSize: 11, lineHeight: 17, color: colors.textMuted },
  scroll: { flex: 1, minHeight: 0 },
  pages: { paddingBottom: 12, paddingRight: 8 },
  list: { width: '100%', gap: 16 },
  label: { color: colors.text, fontSize: 11, lineHeight: 16 },
  toggle: { minHeight: 36, justifyContent: 'center' },
  toggleText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
})
