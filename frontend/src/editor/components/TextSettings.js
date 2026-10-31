import { useFormFactor } from '../../shared/useFormFactor'
import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../../shared/theme'
import Svg, { Path } from 'react-native-svg'
import { usePalette } from '../hooks/usePalettes'
import { fontLabel, TEXT_COLORS, getTextFonts, subscribeTextFonts, textFontListSnapshot, textStyle, textStyleSupport, textStyleReady, textFontChangePatch } from '../utils/text'
import { openFontStudio } from '../../handwriting/studioBus.js'
import { useTextFont } from '../hooks/useTextFont'
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
const VERTICAL_ALIGN_PATHS = {
  top: 'M6 6h12M8 9h8M6 12h12',
  middle: 'M6 9h12M8 12h8M6 15h12',
  bottom: 'M6 12h12M8 15h8M6 18h12',
}
const VERTICAL_ALIGNS = [['top','위 정렬'],['middle','세로 가운데 정렬'],['bottom','아래 정렬']]


/** 텍스트 서식. 스티커·마테·사진 옵션과 같은 모양(구역 제목·세그먼트 버튼·막대·색 줄)으로 만든다 */
export default function TextSettings({ settings, onChange, onClose, verticalAlignment = false }) {
  const textColors = usePalette?.('text')?.colors ?? TEXT_COLORS // 꾸미기 공방 '내 프리셋'의 글자 색
  useSyncExternalStore(subscribeTextFonts, textFontListSnapshot, textFontListSnapshot)
  const fonts = getTextFonts()
  const personalFonts = fonts.filter(font => font.personal)
  const fontGroups = [
    ...(personalFonts.length ? [{ label: '내 폰트', fonts: personalFonts }] : []),
    { label: '기본 글꼴', fonts: fonts.filter(font => !font.personal) },
  ]

  const fontStatus = useTextFont(settings.font)
  const support = textStyleSupport(settings.font, Platform.OS)
  const styleItems = STYLE_TOGGLES.map(item => ({ ...item, disabled: ['bold', 'italic'].includes(item.id) && (!support[item.id] || !textStyleReady(settings.font, item.id)) }))
  const unavailable = [['bold', '굵게'], ['italic', '기울임']].filter(([id]) => !support[id]).map(([, label]) => label)
  const { isPhone } = useFormFactor()
  const [fontsOpen, setFontsOpen] = useState(false)
  const [spacingOpen, setSpacingOpen] = useState(false)
  const [size, setSize] = useState(String(settings.fontSize))
  useEffect(() => setSize(String(settings.fontSize)), [settings.fontSize])
  const commitSize = (raw = size) => {
    const value = Number(raw)
    if (Number.isFinite(value) && value >= 8 && value <= 96) onChange({ fontSize: value })
    else setSize(String(settings.fontSize))
  }
  return <View style={toolPanelStyles.card}>
    <ToolPanelHeader icon="text" title="텍스트" closeLabel="텍스트 설정 닫기" onClose={onClose} />
    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={toolPanelStyles.content}>
      <Text style={toolPanelStyles.label}>글꼴</Text>
      <View style={[styles.row, { zIndex: 10 }]}>
        <View style={{ flex: 1 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="글꼴 선택" accessibilityState={{ expanded: fontsOpen }} onPress={() => setFontsOpen(!fontsOpen)} style={styles.field}>
            <Text style={[styles.fieldText, previewFont(settings.font)]} numberOfLines={1}>{fontLabel(fonts.find((f) => f.id === settings.font) ?? fonts[0], Platform.OS)}</Text>
            <Svg width={12} height={12} viewBox="0 0 24 24"><Path d={fontsOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} fill="none" stroke={colors.text} strokeWidth={2} /></Svg>
          </Pressable>
        </View>
        <TextInput accessibilityLabel="글자 크기" keyboardType="numeric" value={size} onChangeText={(raw) => { setSize(raw); const value = Number(raw); if (raw.trim() && Number.isFinite(value) && value >= 8 && value <= 96) onChange({ fontSize: value }) }} onEndEditing={(event) => commitSize(event.nativeEvent.text)} onSubmitEditing={(event) => commitSize(event.nativeEvent.text)} selectTextOnFocus style={[styles.size, isPhone && styles.phoneSize]} />
      </View>

      {fontsOpen && <ScrollView accessibilityLabel="글꼴 목록" style={styles.options} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {fontGroups.map(group => <View key={group.label}>
          <Text accessibilityRole="header" style={styles.fontGroup}>{group.label}</Text>
          {group.fonts.map(font => <Pressable key={font.id} accessibilityRole="button" accessibilityLabel={fontLabel(font, Platform.OS)} accessibilityState={{ selected: settings.font === font.id }} onPress={() => { onChange(textFontChangePatch(settings, font.id, Platform.OS)); setFontsOpen(false) }} style={[styles.option, settings.font === font.id && styles.optionSelected]}>
            <Text style={[styles.optionText, previewFont(font.id)]} numberOfLines={1}>{fontLabel(font, Platform.OS)}</Text>
          </Pressable>)}
        </View>)}
      </ScrollView>}

      <Pressable accessibilityRole="button" onPress={() => { setFontsOpen(false); openFontStudio({ onUse: font => onChange(textFontChangePatch(settings, font.id, Platform.OS)) }) }} style={styles.field}><Text style={styles.fieldText}>＋ 나만의 폰트 만들기</Text></Pressable>

      <Text style={toolPanelStyles.label}>스타일</Text>
      <Segmented items={styleItems} selected={(id) => Boolean(settings[id] && (support[id] !== false))} onPress={(id) => { if (!styleItems.find(item => item.id === id)?.disabled) onChange({ [id]: !settings[id] }) }} />
      {unavailable.length > 0 && <Text style={styles.styleNotice}>이 글꼴은 {unavailable.join('·')}을 지원하지 않아요.</Text>}
      {Platform.OS === 'ios' && settings.font === 'sans' && settings.italic && <View>
        <Text style={styles.styleNotice}>기존 문서의 기울임 설정은 유지되며 한글에는 적용되지 않을 수 있어요.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="기존 기울임 설정 해제" onPress={() => onChange({ italic: false })}>
          <Text style={styles.styleNotice}>기존 기울임 설정 해제</Text>
        </Pressable>
      </View>}
      {fontStatus.includes(':error') ? <Text style={styles.styleNotice}>글꼴 일부를 불러오지 못했어요. 사용할 수 없는 서식은 꺼져 있어요.</Text> : fontStatus.includes(':loading') ? <Text style={styles.styleNotice}>글꼴을 준비하고 있어요.</Text> : null}

      <Text style={toolPanelStyles.label}>정렬</Text>
      <Segmented
        items={ALIGNS.map(([id, label]) => ({ id, a11y: label, icon: <Svg width={20} height={20} viewBox="0 0 24 24"><Path d={ALIGN_PATHS[id]} stroke={settings.textAlign === id ? colors.text : colors.textMuted} strokeWidth={1.8} strokeLinecap="round" /></Svg> }))}
        selected={(id) => settings.textAlign === id}
        onPress={(id) => onChange({ textAlign: id })}
      />

      {verticalAlignment && <>
        <Text style={toolPanelStyles.label}>세로 정렬</Text>
        <Segmented items={VERTICAL_ALIGNS.map(([id,label])=>({id,a11y:label,icon:<Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M4 3h16M4 21h16" stroke={settings.verticalAlign===id?colors.text:colors.textMuted} strokeWidth={1.8} strokeOpacity={0.35} strokeLinecap="round" /><Path d={VERTICAL_ALIGN_PATHS[id]} stroke={settings.verticalAlign===id?colors.text:colors.textMuted} strokeWidth={1.8} strokeLinecap="round" /></Svg>}))} selected={id=>settings.verticalAlign===id} onPress={id=>onChange({verticalAlign:id})} />
      </>}

      <Text style={toolPanelStyles.label}>글자 색상</Text>
      <View style={styles.colors}>
        {textColors.map((color) => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`글자 전체 색상 ${color}`} accessibilityState={{ selected: settings.color === color }} onPress={() => onChange({ color })} style={[styles.swatch, { backgroundColor: color }, settings.color === color && styles.chosen]} />)}
      </View>
      <Text style={toolPanelStyles.label}>내 색상</Text>
      <MyColorPresets scope="text" value={settings.color} label="글자 색상" onPick={(color) => onChange({ color })} />

      {/* 코덱스 23번: 자간·줄간격은 '간격' 접기 영역으로 (기본 화면은 글꼴·크기·스타일·정렬·글자 색만) */}
      <Pressable accessibilityRole="button" accessibilityLabel="간격" accessibilityState={{ expanded: spacingOpen }} onPress={() => setSpacingOpen(open => !open)} style={styles.field}>
        <Text style={styles.fieldText}>간격</Text>
        <Svg width={12} height={12} viewBox="0 0 24 24"><Path d={spacingOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} fill="none" stroke={colors.text} strokeWidth={2} /></Svg>
      </Pressable>
      {spacingOpen && <>
      {/* 막대와 숫자로 (글자 크기 대비 백분율 값, 단위 표시는 뺀다) */}
      <Text style={toolPanelStyles.label}>자간</Text>
      <Slider value={settings.letterSpacing} min={-0.1} max={0.5} step={0.01} scale={100} label="자간" minusLabel="자간 좁게" plusLabel="자간 넓게" onChange={(value) => onChange({ letterSpacing: Math.round(value * 100) / 100 })} />
      <Text style={toolPanelStyles.label}>줄간격</Text>
      <Slider value={settings.lineSpacing} min={1} max={2.5} step={0.05} scale={100} label="줄간격" minusLabel="줄간격 좁게" plusLabel="줄간격 넓게" onChange={(value) => onChange({ lineSpacing: Math.round(value * 100) / 100 })} />

      </>}
    </ScrollView>
  </View>
}

const styles = StyleSheet.create({
  styleNotice: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  fieldText: { flexShrink: 1, color: colors.text, fontSize: 14 },
  // 글자 크기 칸: 자간·줄간격 막대의 숫자 칸과 같은 모양 (태블릿은 오른쪽, 폰은 가운데 정렬)
  size: { width: 52, height: 40, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, color: colors.text, fontSize: 13, fontWeight: '700', textAlign: 'right', ...(Platform.OS === 'web' && { outlineStyle: 'none' }) },
  phoneSize: { textAlign: 'center' },
  // Keep options inside the panel's layout and touch bounds on Android.
  options: { maxHeight: 280, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 11 },
  fontGroup: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  option: { paddingHorizontal: 12, paddingVertical: 10 },
  optionSelected: { backgroundColor: colors.surfaceMuted },
  optionText: { color: colors.text, fontSize: 16 },
  // 한 줄에 같은 간격으로 (양 끝 여백도 같게)
  colors: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.cardBorder },
  chosen: { borderWidth: 3, borderColor: colors.primaryStrong },
})
