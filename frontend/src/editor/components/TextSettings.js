import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import { useEffect, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../../shared/theme'
import Svg, { Path } from 'react-native-svg'
import { fontLabel, TEXT_COLORS, TEXT_FONTS, textStyle } from '../utils/text'
import MyColorPresets from './controls/MyColorPresets'
import Slider from './controls/Slider'

// 글꼴 이름을 그 글꼴로 보여 준다 (아직 불러오지 못한 앱 글꼴은 기본 글꼴)
const previewFont = (id) => ({ fontFamily: textStyle({ font: id }, 1, Platform.OS).fontFamily })

const STYLE_TOGGLES = [
  { id: 'bold', label: 'B', a11y: '굵게', textStyle: { fontWeight: '800' } },
  { id: 'italic', label: 'I', a11y: '기울임', textStyle: { fontStyle: 'italic' } },
  { id: 'underline', label: 'U', a11y: '밑줄', textStyle: { textDecorationLine: 'underline' } },
  { id: 'strike', label: 'S', a11y: '취소선', textStyle: { textDecorationLine: 'line-through' } },
]
const ALIGN_PATHS = {
  left: 'M4 5h16M4 10h10M4 15h16M4 20h10',
  center: 'M4 5h16M7 10h10M4 15h16M7 20h10',
  right: 'M4 5h16M10 10h10M4 15h16M10 20h10',
  justify: 'M4 5h16M4 10h16M4 15h16M4 20h16',
}
const ALIGNS = [['left', '왼쪽 정렬'], ['center', '가운데 정렬'], ['right', '오른쪽 정렬'], ['justify', '양쪽 정렬']]

/** 텍스트 서식. 스티커·마테·사진 옵션과 같은 모양(구역 제목·세그먼트 버튼·막대·색 줄)으로 만든다 */
export default function TextSettings({ settings, onChange, onClose }) {
  const [fontsOpen, setFontsOpen] = useState(false)
  const [size, setSize] = useState(String(settings.fontSize))
  useEffect(() => setSize(String(settings.fontSize)), [settings.fontSize])
  const commitSize = (raw = size) => {
    const value = Number(raw)
    if (Number.isFinite(value) && value >= 8 && value <= 96) onChange({ fontSize: value })
    else setSize(String(settings.fontSize))
  }
  return <View style={toolPanelStyles.card}>
    <ToolPanelHeader icon="text" title="텍스트" closeLabel="텍스트 설정 닫기" onClose={onClose} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={toolPanelStyles.content}>
      <Text style={toolPanelStyles.label}>글꼴</Text>
      <View style={[styles.row, { zIndex: 10 }]}>
        <View style={{ flex: 1 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="글꼴 선택" accessibilityState={{ expanded: fontsOpen }} onPress={() => setFontsOpen(!fontsOpen)} style={styles.field}>
            <Text style={[styles.fieldText, previewFont(settings.font)]} numberOfLines={1}>{fontLabel(TEXT_FONTS.find((f) => f.id === settings.font) ?? TEXT_FONTS[0], Platform.OS)}</Text>
            <Svg width={12} height={12} viewBox="0 0 24 24"><Path d={fontsOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} fill="none" stroke={colors.text} strokeWidth={2} /></Svg>
          </Pressable>
          {fontsOpen && <ScrollView style={styles.options} nestedScrollEnabled keyboardShouldPersistTaps="handled">{TEXT_FONTS.map((font) => (
            <Pressable key={font.id} accessibilityRole="button" accessibilityLabel={fontLabel(font, Platform.OS)} accessibilityState={{ selected: settings.font === font.id }} onPress={() => { onChange({ font: font.id }); setFontsOpen(false) }} style={[styles.option, settings.font === font.id && styles.optionSelected]}>
              <Text style={[styles.optionText, previewFont(font.id)]} numberOfLines={1}>{fontLabel(font, Platform.OS)}</Text>
            </Pressable>
          ))}</ScrollView>}
        </View>
        <TextInput accessibilityLabel="글자 크기" keyboardType="numeric" value={size} onChangeText={(raw) => { setSize(raw); const value = Number(raw); if (raw.trim() && Number.isFinite(value) && value >= 8 && value <= 96) onChange({ fontSize: value }) }} onEndEditing={(event) => commitSize(event.nativeEvent.text)} onSubmitEditing={(event) => commitSize(event.nativeEvent.text)} selectTextOnFocus style={[styles.field, styles.size]} />
      </View>

      <Text style={toolPanelStyles.label}>스타일</Text>
      <Segmented items={STYLE_TOGGLES} selected={(id) => Boolean(settings[id])} onPress={(id) => onChange({ [id]: !settings[id] })} />

      <Text style={toolPanelStyles.label}>정렬</Text>
      <Segmented
        items={ALIGNS.map(([id, label]) => ({ id, a11y: label, icon: <Svg width={20} height={20} viewBox="0 0 24 24"><Path d={ALIGN_PATHS[id]} stroke={settings.textAlign === id ? colors.text : colors.textMuted} strokeWidth={1.8} strokeLinecap="round" /></Svg> }))}
        selected={(id) => settings.textAlign === id}
        onPress={(id) => onChange({ textAlign: id })}
      />

      {/* 자간·줄간격: Canva 의 '간격' 처럼 막대와 숫자로 (글자 크기 대비 %) */}
      <Text style={toolPanelStyles.label}>자간</Text>
      <Slider value={settings.letterSpacing} min={-0.1} max={0.5} step={0.01} scale={100} unit="%" label="자간" minusLabel="자간 좁게" plusLabel="자간 넓게" onChange={(value) => onChange({ letterSpacing: Math.round(value * 100) / 100 })} />
      <Text style={toolPanelStyles.label}>줄간격</Text>
      <Slider value={settings.lineSpacing} min={1} max={2.5} step={0.05} scale={100} unit="%" label="줄간격" minusLabel="줄간격 좁게" plusLabel="줄간격 넓게" onChange={(value) => onChange({ lineSpacing: Math.round(value * 100) / 100 })} />

      <Text style={toolPanelStyles.label}>글자 색상</Text>
      <View style={styles.colors}>
        {TEXT_COLORS.map((color) => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`글자 전체 색상 ${color}`} accessibilityState={{ selected: settings.color === color }} onPress={() => onChange({ color })} style={[styles.swatch, { backgroundColor: color }, settings.color === color && styles.chosen]} />)}
      </View>
      <Text style={toolPanelStyles.label}>내 색상</Text>
      <MyColorPresets scope="text" value={settings.color} label="글자 색상" onPick={(color) => onChange({ color })} />
    </ScrollView>
  </View>
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 42, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  fieldText: { flexShrink: 1, color: colors.text, fontSize: 14 },
  size: { width: 60, color: colors.text, fontSize: 14, textAlign: 'center' },
  options: { position: 'absolute', top: '100%', marginTop: 4, left: 0, right: 0, maxHeight: 280, zIndex: 20, elevation: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 11 },
  option: { paddingHorizontal: 12, paddingVertical: 10 },
  optionSelected: { backgroundColor: '#EEF2F9' },
  optionText: { color: colors.text, fontSize: 16 },
  // 한 줄에 같은 간격으로 (양 끝 여백도 같게)
  colors: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border },
  chosen: { borderWidth: 3, borderColor: colors.primary },
})
