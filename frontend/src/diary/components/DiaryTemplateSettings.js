import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import PageBackground from '../../editor/components/PageBackground'
import NotePreview from '../../editor/components/NotePreview'
import { TEMPLATE_VERSION, getTemplate, normalizeOrientation, templateCanvasSize, templateIdForOrientation } from '../../editor/templates/catalog.js'
import { creationTemplates } from '../../editor/templates/creation.js'
import { isUndated, undatedTemplateId } from '../../editor/templates/undated.js'
import { colors } from '../../shared/theme'

export function TemplatePreview({ assetId, width: previewWidth = 176, appearance }) {
  const asset = getTemplate(assetId)
  const { width, height } = templateCanvasSize(asset.orientation)
  const noteKind = assetId.match(/note-(plain|ruled|grid|dots)-/)?.[1]
  return <View style={[s.preview, { width: previewWidth, height: previewWidth * height / width }]}>
    {noteKind ? <NotePreview background={noteKind} width={previewWidth} height={previewWidth * height / width} appearance={appearance} />
      : <PageBackground page={{ id: assetId, backgroundAssetId: assetId, templateVersion: TEMPLATE_VERSION, canvasWidth: width, canvasHeight: height, paperAppearance: appearance }} zoom={previewWidth / width} compact />}
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

function TemplateChoices({ templates, choices, onChange, undated = false }) {
  return <ScrollView horizontal nestedScrollEnabled keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={s.choices}>
    {templates.map(item => {
      const choice = choices.find(entry => entry.assetId === item.assetId)
      return <View key={item.assetId} style={[s.choice, s.multiChoice, choice.enabled && s.selected]}>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={item.name + ' 포함'} accessibilityState={{ checked: choice.enabled }} onPress={() => onChange(item.assetId, { enabled: !choice.enabled })} style={s.cardToggle}>
          <TemplatePreview assetId={item.assetId} />
          <View style={s.row}>
            <Text style={s.label}>{item.name}</Text>
            <View style={[s.check, choice.enabled && s.checked]}><Text style={s.tick}>{choice.enabled ? '✓' : ''}</Text></View>
          </View>
        </Pressable>
        <View style={!choice.enabled && s.disabled} pointerEvents={choice.enabled ? 'auto' : 'none'} accessibilityElementsHidden={!choice.enabled} importantForAccessibility={choice.enabled ? 'auto' : 'no-hide-descendants'}>
          <Count label={undated ? '한 달' : '매월'} inputLabel={(undated ? '한 달 ' : '매월 ') + item.name} value={choice.count} onChange={count => onChange(item.assetId, { count })} />
        </View>
      </View>
    })}
  </ScrollView>
}

export default function DiaryTemplateSettings({ value, onChange }) {
  const orientation = normalizeOrientation(value.orientation)
  const undated = isUndated(value)
  const { daily, extra, weekly } = creationTemplates(orientation, value.dateMode)
  const assetId = id => templateIdForOrientation(id, orientation)
  const previewId = (kind, datedId) => undated ? undatedTemplateId(kind, orientation) : assetId(datedId)
  const toggle = key => onChange({ ...value, [key]: !value[key] })
  const updateChoice = (key, assetId, patch) => onChange({ ...value, [key]: value[key].map(item => item.assetId === assetId ? { ...item, ...patch } : item) })
  return <View>
    <Text style={s.intro}>{undated ? '만년형 · 한 달' : '2026년 · 일 년'} · {orientation === 'portrait' ? '세로형' : '가로형'} 내지 구성</Text>
    <Section title="월간 달력" enabled={value.monthly} onToggle={() => toggle('monthly')} hint={undated ? '날짜 없는 6주 달력 · 1장' : '1~12월 달력 · 연간 12장'}>
      <TemplatePreview assetId={previewId('monthly', '2026-monthly-01-landscape')} />
    </Section>
    <Section title="주간 계획" enabled={value.weekly} onToggle={() => toggle('weekly')} hint={(undated ? '한 달 6장' : '연간 53장') + ' · 원하는 양식 하나를 골라 주세요.'}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choices}>
        {weekly.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ selected: value.weeklyStyle === item.id }} onPress={() => onChange({ ...value, weeklyStyle: item.id })} style={[s.choice, value.weeklyStyle === item.id && s.selected]}>
          <TemplatePreview assetId={item.assetId} /><Text style={s.label}>{item.name}</Text>
        </Pressable>)}
      </ScrollView>
    </Section>
    <Section title="하루 기록" enabled={value.daily} onToggle={() => toggle('daily')} hint={'하루 계획·일기·사진·스크랩을 함께 고를 수 있어요. ' + (undated ? '선택한 장수만큼 한 달에 넣어요.' : '같은 구성을 모든 월에 넣어요.')}>
      <TemplateChoices templates={daily} choices={value.dailyTemplates} undated={undated} onChange={(assetId, patch) => updateChoice('dailyTemplates', assetId, patch)} />
      <Text style={[s.hint, { marginTop: 8 }]}>예: 하루 계획 3장 + 일기 2장 → {undated ? '한 달 5장' : '매월 5장, 연간 60장'}</Text>
    </Section>
    <Section title="첫 장 표지" enabled={value.cover} onToggle={() => toggle('cover')} hint="다이어리 첫 페이지 · 1장">
      <TemplatePreview assetId={previewId('cover', '2026-cover-landscape')} />
    </Section>
    <Section title="월별 구분 페이지" enabled={value.dividers} onToggle={() => toggle('dividers')} hint={undated ? '월을 직접 쓰는 구분 페이지 · 1장' : '각 월의 첫 페이지 · 연간 12장'}>
      <TemplatePreview assetId={previewId('divider', '2026-divider-01-landscape')} />
    </Section>
    <Text style={s.intro}>자유 노트</Text>
    <Text style={s.hint}>{undated ? '한 달에 넣을 종류와 장수를 골라 주세요. 하루 기록 뒤에 넣어요.' : '매월 적용되는 종류와 장수를 골라 주세요. 같은 구성을 1~12월의 하루 기록 뒤에 넣어요.'}</Text>
    <TemplateChoices templates={extra} choices={value.reusable} undated={undated} onChange={(assetId, patch) => updateChoice('reusable', assetId, patch)} />
    <Text style={[s.hint, { marginTop: 10 }]}>{undated ? '자유 노트를 2장 고르면 총 2장이 추가돼요.' : '자유 노트를 매월 2장 고르면 연간 24장이 추가돼요.'}</Text>
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
