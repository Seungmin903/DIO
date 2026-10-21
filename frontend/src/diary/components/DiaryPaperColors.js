import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import PageBackground from '../../editor/components/PageBackground'
import ColorPicker from '../../editor/components/controls/ColorPicker'
import { configuredPageIds } from '../../editor/templates/creation.js'
import { TEMPLATE_VERSION, getTemplate, templateCanvasSize } from '../../editor/templates/catalog.js'
import { colors } from '../../shared/theme'
import { PAPER_BACKGROUNDS, PAPER_LAYOUTS } from '../../editor/templates/appearance.js'
import AppIcon from '../../shared/AppIcon'

const BACKGROUNDS = PAPER_BACKGROUNDS
const LAYOUTS = PAPER_LAYOUTS

export function DiaryPaperColorButton({ appearance, disabled, onPress }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="내지 색상 변경 (선택)" disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.colorEntry, pressed && { opacity: 0.8 }, disabled && { opacity: 0.4 }]}>
    <View style={s.colorDots}>
      <View style={[s.colorDot, { backgroundColor: appearance.backgroundColor }]} />
      <View style={[s.colorDot, s.inkDot, { backgroundColor: appearance.layoutColor }]} />
    </View>
    <View style={{ flex: 1, gap: 4 }}><Text style={s.title}>내지 색상 변경</Text><Text style={s.entryHint}>배경·레이아웃 색상을 골라 보세요 · 선택</Text></View>
    <AppIcon name="chevron-right" size={20} />
  </Pressable>
}

export function DiaryPaperPreview({ config, appearance }) {
  const assetId = useMemo(() => configuredPageIds(config)[0], [config])
  const [width, setWidth] = useState(200)
  const dimensions = assetId ? templateCanvasSize(getTemplate(assetId).orientation) : config.orientation === 'portrait' ? templateCanvasSize('portrait') : { width: 1188, height: 840 }
  const page = useMemo(() => ({ id: 'creation-first-page', backgroundAssetId: assetId, templateVersion: TEMPLATE_VERSION,
    canvasWidth: dimensions.width, canvasHeight: dimensions.height, paperAppearance: appearance }), [assetId, appearance, dimensions.width, dimensions.height])
  return <View style={s.previewWrap}>
    <Text style={s.previewTitle}>첫 페이지 미리보기</Text>
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={[s.preview, { aspectRatio: page.canvasWidth / page.canvasHeight }]}>
      <PageBackground page={page} zoom={width / page.canvasWidth} compact />
    </View>
    <Text style={s.hint}>선택한 색상을 모든 내지에 적용해요.</Text>
  </View>
}

export default function DiaryPaperColors({ value, onChange, onInteractionChange }) {
  const [palette, setPalette] = useState(null)
  return <View>
    <Text style={s.intro}>내지의 분위기를 골라 주세요</Text>
    <Text style={s.hint}>추천 색상을 고르거나 +를 눌러 원하는 색을 지정하세요. 첫 페이지 미리보기에 바로 반영돼요.</Text>
    {[['backgroundColor', '배경색', BACKGROUNDS], ['layoutColor', '레이아웃 색상', LAYOUTS]].map(([key, label, presets]) => {
      const selected = value[key]
      const custom = !presets.some(([, color]) => color === selected)
      return <View key={key} style={s.section}>
        <View style={s.heading}><Text style={s.title}>{label}</Text><Text style={s.hex}>{selected}</Text></View>
        <View style={s.swatches}>
          {presets.map(([name, color]) => <Pressable key={color} accessibilityRole="radio" accessibilityLabel={label + ' ' + name} accessibilityState={{ selected: selected === color }} onPress={() => onChange({ ...value, [key]: color })} style={[s.swatchButton, selected === color && s.selected]}>
            <View style={[s.swatch, { backgroundColor: color }]} />
            <Text style={s.name}>{name}</Text>
          </Pressable>)}
          <Pressable accessibilityRole="button" accessibilityLabel={label + ' 직접 지정 팔레트'} accessibilityState={{ expanded: palette === key }} onPress={() => setPalette(palette === key ? null : key)} style={[s.swatchButton, (palette === key || custom) && s.selected]}>
            <View style={[s.swatch, s.add, custom && { backgroundColor: selected }]}><Text style={[s.plus, custom && { color: parseInt(selected.slice(1, 3), 16) * 0.299 + parseInt(selected.slice(3, 5), 16) * 0.587 + parseInt(selected.slice(5, 7), 16) * 0.114 < 150 ? '#FFFFFF' : colors.text }]}>+</Text></View><Text style={s.name}>직접 지정</Text>
          </Pressable>
        </View>
        {palette === key && <View style={s.picker}>
          <View style={s.heading}><Text style={s.title}>{label} 팔레트</Text><Pressable accessibilityRole="button" accessibilityLabel={label + ' 팔레트 닫기'} onPress={() => setPalette(null)} style={s.close}><Text style={s.closeText}>닫기 ×</Text></Pressable></View>
          <ColorPicker onInteractionChange={onInteractionChange} value={selected} label={label} onChange={color => onChange({ ...value, [key]: color })} />
        </View>}
      </View>
    })}
    <Text style={s.hint}>레이아웃의 글자와 선은 기존 농도 차이를 유지해요. 배경과 너무 비슷한 색을 고르면 잘 보이지 않을 수 있어요.</Text>
  </View>
}
const s = StyleSheet.create({
  colorEntry: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 64, borderWidth: 1, borderColor: colors.primary, borderRadius: 14, backgroundColor: colors.primarySoft, marginBottom: 14 },
  colorDots: { width: 46, height: 34, justifyContent: 'center' },
  colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border },
  inkDot: { position: 'absolute', right: 0, top: 4, borderColor: '#FFFFFF', borderWidth: 2 },
  entryHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  intro: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: 10, marginBottom: 10 },
  section: { marginTop: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  title: { color: colors.text, fontSize: 14, fontWeight: '800' },
  hex: { color: colors.textMuted, fontSize: 12 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  swatchButton: { alignItems: 'center', justifyContent: 'center', padding: 6, minWidth: 62, minHeight: 66, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', gap: 5 },
  selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(11,25,87,0.15)' },
  name: { fontSize: 10, color: colors.text },
  add: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  plus: { color: colors.text, fontSize: 24, lineHeight: 28 },
  picker: { marginTop: 12, padding: 12, backgroundColor: colors.surfaceSoft, borderRadius: 12 },
  close: { minHeight: 44, minWidth: 60, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textMuted, fontSize: 12 },
  previewWrap: { width: '100%' },
  previewTitle: { color: colors.text, fontSize: 13, fontWeight: '800', marginBottom: 14 },
  preview: { width: '100%', overflow: 'hidden', borderRadius: 5, borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF' },
})
