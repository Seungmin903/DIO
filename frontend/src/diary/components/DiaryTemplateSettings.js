import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import PageBackground from '../../editor/components/PageBackground'
import { TEMPLATE_VERSION } from '../../editor/templates/catalog.js'
import { DAILY_TEMPLATES, EXTRA_TEMPLATES, WEEKLY_CHOICES } from '../../editor/templates/creation.js'
import { colors } from '../../shared/theme'

function Preview({ assetId }) {
  return <View style={s.preview}>
    <PageBackground page={{ id: assetId, backgroundAssetId: assetId, templateVersion: TEMPLATE_VERSION, canvasWidth: 1024, canvasHeight: 768 }} zoom={176 / 1024} compact />
  </View>
}

function Section({ title, enabled, onToggle, children, hint }) {
  return <View style={s.section}>
    <Pressable accessibilityRole="checkbox" accessibilityLabel={title + ' 포함'} accessibilityState={{ checked: enabled }} onPress={onToggle} style={s.row}>
      <Text style={s.title}>{title}</Text>
      <View style={[s.check, enabled && s.checked]}><Text style={s.tick}>{enabled ? '✓' : ''}</Text></View>
    </Pressable>
    {hint && <Text style={s.hint}>{hint}</Text>}
    <View style={!enabled && s.disabled} pointerEvents={enabled ? 'auto' : 'none'} accessibilityElementsHidden={!enabled} importantForAccessibility={enabled ? 'auto' : 'no-hide-descendants'}>{children}</View>
  </View>
}

function Count({ label, value, onChange, inputLabel = label }) {
  return <View style={s.countRow}>
    <Text style={s.label}>{label}</Text>
    <TextInput accessibilityLabel={inputLabel + ' 장수'} value={String(value)} onChangeText={onChange} keyboardType="number-pad" selectTextOnFocus style={s.count} />
    <Text style={s.label}>장</Text>
  </View>
}

function TemplateChoices({ templates, choices, onChange }) {
  return <ScrollView horizontal nestedScrollEnabled keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={s.choices}>
    {templates.map(item => {
      const choice = choices.find(entry => entry.assetId === item.assetId)
      return <View key={item.assetId} style={[s.choice, s.multiChoice, choice.enabled && s.selected]}>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={item.name + ' 포함'} accessibilityState={{ checked: choice.enabled }} onPress={() => onChange(item.assetId, { enabled: !choice.enabled })} style={s.cardToggle}>
          <Preview assetId={item.assetId} />
          <View style={s.row}>
            <Text style={s.label}>{item.name}</Text>
            <View style={[s.check, choice.enabled && s.checked]}><Text style={s.tick}>{choice.enabled ? '✓' : ''}</Text></View>
          </View>
        </Pressable>
        <View style={!choice.enabled && s.disabled} pointerEvents={choice.enabled ? 'auto' : 'none'} accessibilityElementsHidden={!choice.enabled} importantForAccessibility={choice.enabled ? 'auto' : 'no-hide-descendants'}>
          <Count label="매월" inputLabel={'매월 ' + item.name} value={choice.count} onChange={count => onChange(item.assetId, { count })} />
        </View>
      </View>
    })}
  </ScrollView>
}

export default function DiaryTemplateSettings({ value, onChange }) {
  const toggle = key => onChange({ ...value, [key]: !value[key] })
  const updateChoice = (key, assetId, patch) => onChange({ ...value, [key]: value[key].map(item => item.assetId === assetId ? { ...item, ...patch } : item) })
  return <View>
    <Text style={s.intro}>2026년 · 가로형 속지</Text>
    <Text style={s.hint}>표지 다음에 1~12월을 월별로 구성해요. 각 월은 구분지 → 먼슬리 → 위클리 → 데일리 → 공용 노트 순서예요.</Text>
    <Section title="먼슬리" enabled={value.monthly} onToggle={() => toggle('monthly')} hint="1~12월 달력 · 총 12장">
      <Preview assetId="2026-monthly-01-landscape" />
    </Section>
    <Section title="위클리" enabled={value.weekly} onToggle={() => toggle('weekly')} hint="총 53장 · 원하는 양식 하나를 골라 주세요.">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choices}>
        {WEEKLY_CHOICES.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ selected: value.weeklyStyle === item.id }} onPress={() => onChange({ ...value, weeklyStyle: item.id })} style={[s.choice, value.weeklyStyle === item.id && s.selected]}>
          <Preview assetId={item.assetId} /><Text style={s.label}>{item.name}</Text>
        </Pressable>)}
      </ScrollView>
    </Section>
    <Section title="데일리" enabled={value.daily} onToggle={() => toggle('daily')} hint="플래너·일기·포토/스크랩을 함께 고를 수 있어요. 같은 구성을 모든 월에 넣어요.">
      <Text style={s.hint}>좌우로 넘겨 여러 양식을 고르고, 각각 장수를 정해 주세요.</Text>
      <TemplateChoices templates={DAILY_TEMPLATES} choices={value.dailyTemplates} onChange={(assetId, patch) => updateChoice('dailyTemplates', assetId, patch)} />
      <Text style={[s.hint, { marginTop: 8 }]}>예: 플래너 3장 + 일기 2장 → 매월 5장, 연간 60장</Text>
    </Section>
    <Section title="속지 표지" enabled={value.cover} onToggle={() => toggle('cover')} hint="다이어리 첫 페이지 · 1장">
      <Preview assetId="2026-cover-landscape" />
    </Section>
    <Section title="월 구분지" enabled={value.dividers} onToggle={() => toggle('dividers')} hint="각 월의 첫 페이지 · 총 12장">
      <Preview assetId="2026-divider-01-landscape" />
    </Section>
    <Text style={s.intro}>공용 속지</Text>
    <Text style={s.hint}>한 달에 넣을 노트의 종류와 장수를 골라 주세요. 같은 구성을 1~12월의 데일리 뒤에 넣어요.</Text>
    <Text style={s.hint}>좌우로 넘겨 여러 종류를 고를 수 있어요.</Text>
    <TemplateChoices templates={EXTRA_TEMPLATES} choices={value.reusable} onChange={(assetId, patch) => updateChoice('reusable', assetId, patch)} />
    <Text style={[s.hint, { marginTop: 10 }]}>공용 노트를 매월 2장 고르면 연간 24장이 추가돼요.</Text>
    <Text style={s.hint}>모두 제외하면 속지 없는 빈 페이지 1장으로 만들어요.</Text>
  </View>
}

const s = StyleSheet.create({
  intro: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 8, marginTop: 6 },
  section: { marginTop: 14, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  title: { fontSize: 14, fontWeight: '800', color: colors.text, flexShrink: 1 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 9 },
  label: { fontSize: 13, color: colors.text, flexShrink: 1 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: '#FFFFFF', fontWeight: '800' },
  disabled: { opacity: 0.4 },
  preview: { width: 176, height: 132, backgroundColor: '#FFFFFF', overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 5 },
  choices: { gap: 8, paddingVertical: 4 },
  choice: { padding: 5, borderRadius: 9, borderWidth: 2, borderColor: 'transparent', gap: 8 },
  multiChoice: { width: 190 },
  cardToggle: { gap: 8 },
  selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  countRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginVertical: 10 },
  count: { width: 72, minHeight: 44, borderRadius: 9, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, color: colors.text, backgroundColor: colors.surfaceSoft },
})
