import { ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../../shared/theme'
import Svg, { Path } from 'react-native-svg'
import { TEXT_COLORS, TEXT_FONTS } from '../utils/text'

export default function TextSettings({ settings, onChange, onClose }) {
  const [fontsOpen, setFontsOpen] = useState(false)
  const [size, setSize] = useState(String(settings.fontSize))
  useEffect(() => setSize(String(settings.fontSize)), [settings.fontSize])
  const commitSize = (raw = size) => {
    const value = Number(raw)
    if (Number.isFinite(value) && value >= 8 && value <= 96) onChange({ fontSize: value })
    else setSize(String(settings.fontSize))
  }
  const button = (key, label, style = {}) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: settings[key] }}
    onPress={() => onChange({ [key]: !settings[key] })} style={[styles.button, settings[key] && styles.selected]}><Text style={[styles.buttonText, style]}>{key === 'bold' ? 'B' : key === 'italic' ? 'I' : 'U'}</Text></Pressable>
  return <View style={[styles.card, toolPanelStyles.card]}>
    <ToolPanelHeader icon="text" title="텍스트" closeLabel="텍스트 설정 닫기" onClose={onClose} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, toolPanelStyles.content]}>
      <Text style={toolPanelStyles.label}>글꼴</Text>
      <View style={[styles.row, { zIndex: 10 }]}>
        <View style={{ flex: 1 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="글꼴 선택" accessibilityState={{ expanded: fontsOpen }} onPress={() => setFontsOpen(!fontsOpen)} style={styles.font}><Text style={styles.buttonText}>{TEXT_FONTS.find((f) => f.id === settings.font)?.label ?? '기본 고딕'}</Text><Svg width={12} height={12} viewBox="0 0 24 24"><Path d={fontsOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} fill="none" stroke={colors.text} strokeWidth={2} /></Svg></Pressable>
        {fontsOpen && <View style={styles.options}>{TEXT_FONTS.map((font) => <Pressable key={font.id} accessibilityRole="button" accessibilityState={{ selected: settings.font === font.id }} onPress={() => { onChange({ font: font.id }); setFontsOpen(false) }} style={[styles.option, settings.font === font.id && styles.selected]}><Text style={styles.buttonText}>{font.label}</Text></Pressable>)}</View>}
        </View>
        <TextInput accessibilityLabel="글자 크기" keyboardType="numeric" value={size} onChangeText={(raw) => { setSize(raw); const value = Number(raw); if (raw.trim() && Number.isFinite(value) && value >= 8 && value <= 96) onChange({ fontSize: value }) }} onEndEditing={(event) => commitSize(event.nativeEvent.text)} onSubmitEditing={(event) => commitSize(event.nativeEvent.text)} selectTextOnFocus style={styles.size} />
      </View>

      <View style={styles.row}>{button('bold', '굵게', { fontWeight: '700' })}{button('italic', '기울임', { fontStyle: 'italic' })}{button('underline', '밑줄', { textDecorationLine: 'underline' })}</View>
      <View style={styles.divider} />
      <Text style={toolPanelStyles.label}>정렬</Text>
      <View style={styles.row}>{[['left', '왼쪽 정렬'], ['center', '가운데 정렬'], ['right', '오른쪽 정렬']].map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: settings.textAlign === value }} onPress={() => onChange({ textAlign: value })} style={[styles.button, settings.textAlign === value && styles.selected]}>
        <Svg width={22} height={22} viewBox="0 0 24 24"><Path d={value === 'left' ? 'M4 5h16M4 10h10M4 15h16M4 20h10' : value === 'center' ? 'M4 5h16M7 10h10M4 15h16M7 20h10' : 'M4 5h16M10 10h10M4 15h16M10 20h10'} stroke={colors.text} strokeWidth={1.8} strokeLinecap="round" /></Svg>
      </Pressable>)}</View>
      <Text style={toolPanelStyles.label}>글자 색상</Text>
      <View style={styles.row}>{TEXT_COLORS.map((color) => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`글자 전체 색상 ${color}`} accessibilityState={{ selected: settings.color === color }} onPress={() => onChange({ color })} style={[styles.swatch, { backgroundColor: color }, settings.color === color && styles.chosen]} />)}</View>
      <Text style={styles.hint}>텍스트를 눌러 내용을 수정하세요.</Text>
    </ScrollView>
  </View>
}

const styles = StyleSheet.create({
  card: { width: 280, maxWidth: '100%', flexShrink: 1, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, elevation: 8, shadowColor: colors.text, shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 6, paddingTop: 4 },
  close: { padding: 12 },
  content: { padding: 16, paddingTop: 0, gap: 10 }, title: { color: colors.text, fontWeight: '700', fontSize: 15 }, label: { color: colors.textMuted, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, font: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  size: { width: 56, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.text, fontSize: 13 },
  button: { width: 40, height: 36, padding: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 8 }, buttonText: { color: colors.text, fontSize: 14 }, selected: { backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.border },
  divider: { height: 1, backgroundColor: colors.border }, swatch: { width: 30, height: 30, borderRadius: 15 }, chosen: { borderWidth: 3, borderColor: colors.primary },
  hint: { color: colors.textMuted, fontSize: 11 }, options: { position: 'absolute', top: '100%', marginTop: 4, left: 0, right: 0, zIndex: 20, elevation: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }, option: { padding: 10 },
})
