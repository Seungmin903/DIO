import { Pressable, StyleSheet, Text, View } from 'react-native'
import { DIARY_PRESETS, presetPreviewId, presetTemplateConfig, templateComposition } from '../../editor/templates/presets.js'
import { TemplatePreview } from './DiaryTemplateSettings'
import { colors } from '../../shared/theme'

export function CompositionSummary({ config }) {
  let summary
  try { summary = templateComposition(config) } catch { return null }
  return <View style={s.summary}>
    <Text style={s.title}>선택한 내지 · 전체 {summary.total}페이지</Text>
    {summary.sections.map((item, i) => <Text key={i} style={s.detail}>
      {item.label} · {item.perMonth == null || summary.months === 1 ? `${item.count}장` : `매월 ${item.perMonth}장 / 연간 ${item.count}장`}
    </Text>)}
    <Text style={s.detail}>{summary.months === 1 ? '한 달에 들어가는' : '매월 적용되는'} 장수: {summary.perMonth}장 (하루 기록·자유 노트)</Text>
    <Text style={s.detail}>전체 페이지 수에는 월간 달력·주간 계획·첫 장 표지·월별 구분 페이지도 포함해요.</Text>
  </View>
}

export default function DiaryPresets({ selected, orientation, dateMode = 'dated', appearance, onSelect, onCustomize }) {
  return <View style={s.list}>
    <Text style={s.detail}>추천 구성을 고르면 바로 시작할 수 있어요.</Text>
    {DIARY_PRESETS.map(preset => {
      const summary = templateComposition(presetTemplateConfig(preset.id, orientation, dateMode))
      const checked = selected === preset.id
      return <Pressable key={preset.id} accessibilityRole="radio"
        accessibilityLabel={`${preset.name}${preset.recommended ? ', 추천' : ''}, 전체 ${summary.total}페이지`}
        accessibilityState={{ selected: checked, checked }} aria-checked={checked} aria-selected={checked} onPress={() => onSelect(preset.id)}
        style={({ pressed }) => [s.card, checked && s.selected, pressed && { opacity: 0.8 }]}>
        <View pointerEvents="none"><TemplatePreview assetId={presetPreviewId(preset, orientation, dateMode)} width={80} appearance={appearance} /></View>
        <View style={s.body}>
          <View style={s.heading}><Text style={s.title}>{preset.name}</Text>{preset.recommended && <Text style={s.badge}>추천</Text>}</View>
          <Text style={s.description}>{preset.description}</Text>
          <Text style={s.detail}>{summary.sections.filter(item => item.label !== '첫 장 표지' && item.label !== '월별 구분 페이지').map(item => `${item.label} ${item.perMonth == null || summary.months === 1 ? `${item.count}장` : `매월 ${item.perMonth}장`}`).join(' + ')}</Text>
          <Text style={s.detail}>{summary.sections.filter(item => item.label === '첫 장 표지' || item.label === '월별 구분 페이지').map(item => `${item.label} ${item.count}장`).join(' + ')} 포함</Text>
          <Text style={s.total}>전체 {summary.total}페이지</Text>
        </View>
        <View style={[s.check, checked && s.checked]}><Text style={s.tick}>{checked ? '✓' : ''}</Text></View>
      </Pressable>
    })}
    <Pressable accessibilityRole="button" onPress={onCustomize} style={s.customize}><Text style={s.customizeText}>직접 구성하기</Text></Pressable>
  </View>
}

const s = StyleSheet.create({
  list: { gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 2, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface },
  selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  body: { flex: 1, minWidth: 0, gap: 5 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  badge: { color: colors.text, fontSize: 10, fontWeight: '700', backgroundColor: colors.surfaceSoft, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  description: { color: colors.text, fontSize: 12, lineHeight: 18 },
  detail: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  total: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 3 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  customize: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  customizeText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  summary: { gap: 5, padding: 12, borderRadius: 12, backgroundColor: colors.primarySoft, marginBottom: 12 },
})
