import { useRef } from 'react'
import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import { Pressable, ScrollView, StyleSheet, Text, View, Switch } from 'react-native'
import { colors } from '../../shared/theme'
import MyColorPresets from './controls/MyColorPresets'
import Slider from './controls/Slider'
import { EDITOR_COLORS, HIGHLIGHTER_COLORS, PEN_TYPES, penPressure } from '../utils/penSettings'
import { usePalette } from '../hooks/usePalettes'
import { useRecentPenColors } from '../hooks/useRecentPenColors'
import { createStroke } from '../utils/strokes'
import ObjectContent from './canvas/ObjectView'

export function PenSample({ settings, small = false }) {
  const points = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40
    return { x: 12 + t * 240, y: settings.kind === 'highlighter' ? 24 : 24 + Math.sin(t * Math.PI * 2) * 12, pressure: penPressure(settings.kind, 0.5 + Math.sin(t * Math.PI) * 1.1) }
  })
  const stroke = createStroke(points, settings)
  return <View pointerEvents="none" style={{ height: small ? 26 : 54, justifyContent: 'center', alignItems: 'center' }}>
    <ObjectContent object={stroke} zoom={small ? 0.2 : 0.95} />
  </View>
}

/**
 * 펜·형광펜 설정. 스티커·마테·사진 옵션과 같은 모양: 구역 제목, 세그먼트 버튼, 막대(−·+·숫자), 색 한 줄, 내 색상.
 * 내 색상은 펜·형광펜이 각자 따로 저장한다 (controls/MyColorPresets).
 */
export default function PenSettings({ settings, onChange, onClose, straightAssist = true, onStraightAssistChange, onOpenColorPicker, pickerVisible = false }) {
  const root = useRef(null)
  const anchor = useRef(null)
  const highlighter = settings.kind === 'highlighter'
  const label = highlighter ? '형광펜' : '펜'
  const recentColors = useRecentPenColors(highlighter ? 'highlighter' : 'pen')
  // 색 줄은 꾸미기 공방 '내 프리셋'에서 바꾼 목록을 따른다(바꾼 적 없으면 기본 색)
  const palette = usePalette?.(highlighter ? 'highlighter' : 'pen')?.colors ?? (highlighter ? HIGHLIGHTER_COLORS : EDITOR_COLORS)
  const chooseColor = (color) => onChange({ ...settings, color })
  return <View ref={root} collapsable={false} style={toolPanelStyles.card}
    onLayout={() => root.current?.measureInWindow?.((x, y, width, height) => {
      if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) anchor.current = { x, y, width, height }
    })}>
    <ToolPanelHeader icon={highlighter ? 'highlighter' : 'pen'} title={label} closeLabel={`${label} 설정 닫기`} onClose={onClose} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={toolPanelStyles.content}>
      <View accessibilityLabel={`${label} 미리보기`} style={styles.preview}><PenSample settings={settings} /></View>
      <Text style={toolPanelStyles.label}>{highlighter ? '획 끝 모양' : '펜 종류'}</Text>
      {highlighter ? (
        <Segmented
          items={[{ id: 'round', label: '라운드' }, { id: 'square', label: '스퀘어' }]}
          selected={(id) => settings.lineCap === id}
          onPress={(id) => onChange({ ...settings, lineCap: id })}
        />
      ) : (
        <View style={styles.types}>{PEN_TYPES.map((type) => (
          <Pressable key={type.id} accessibilityRole="button" accessibilityLabel={type.label} accessibilityState={{ selected: settings.kind === type.id }}
            onPress={() => onChange({ ...settings, kind: type.id })} style={[styles.type, settings.kind === type.id && styles.typeSelected]}>
            <PenSample settings={{ ...settings, kind: type.id, width: 10 }} small /><Text style={[styles.typeText, settings.kind === type.id && styles.typeTextSelected]}>{type.label}</Text>
          </Pressable>
        ))}</View>
      )}
      <Text style={toolPanelStyles.label}>굵기</Text>
      <Slider label={highlighter ? '형광펜 굵기' : '펜 굵기'} minusLabel={`${label} 가늘게`} plusLabel={`${label} 굵게`} min={highlighter ? 8 : 1} max={highlighter ? 40 : 16} step={0.5} value={settings.width} onChange={(width) => onChange({ ...settings, width: Math.round(width * 2) / 2 })} />
      <Text style={toolPanelStyles.label}>기본 색상</Text>
      {/* 한 줄에 같은 간격으로 (양 끝 여백도 같게) */}
      <View style={styles.palette}>{palette.map((color) => (
        <Pressable key={color} accessibilityRole="button" accessibilityLabel={`색상 ${color}`} accessibilityState={{ selected: settings.color === color }}
          onPress={() => chooseColor(color)} style={[styles.swatch, { backgroundColor: color }, settings.color === color && styles.chosen]} />
      ))}</View>
      <Text style={toolPanelStyles.label}>내 색상</Text>
      <MyColorPresets scope={highlighter ? 'highlighter' : 'pen'} value={settings.color} label={`${label} 색상`} onPick={chooseColor}
        pickerVisible={pickerVisible} onRequestPicker={onOpenColorPicker ? () => onOpenColorPicker(anchor.current) : undefined} />
      <Text style={toolPanelStyles.label}>마지막으로 사용했던 색</Text>
      <View accessibilityLabel={`${label} 최근 사용 색상`} style={[styles.palette, styles.recentPalette]}>
        {recentColors.map(color => <Pressable key={color} accessibilityRole="button"
          accessibilityLabel={`최근 사용한 ${label} 색상 ${color}`} accessibilityState={{ selected: settings.color === color }}
          hitSlop={6} onPress={() => chooseColor(color)}
          style={[styles.swatch, { backgroundColor: color }, settings.color === color && styles.chosen]} />)}
        {!recentColors.length && <Text style={styles.recentEmpty}>필기에 사용한 색이 여기에 저장돼요.</Text>}
      </View>
      <View style={styles.assist}>
        <Text style={styles.assistText}>끝점을 길게 눌러 직선 만들기</Text>
        <Switch accessibilityLabel="끝점에서 길게 눌러 직선 만들기" value={straightAssist} onValueChange={onStraightAssistChange} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.surface} activeThumbColor={colors.surface} />
      </View>
    </ScrollView>
  </View>
}

const styles = StyleSheet.create({
  recentPalette: { justifyContent: 'flex-start', gap: 6 },
  recentEmpty: { color: colors.textMuted, fontSize: 12 },
  preview: { backgroundColor: '#FAFAF7', borderRadius: 12 },
  types: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 11, backgroundColor: colors.surfaceMuted },
  type: { flex: 1, borderRadius: 8, paddingVertical: 6 },
  typeSelected: { backgroundColor: colors.surface, boxShadow: '0px 1px 3px rgba(11, 23, 102, 0.07)' },
  typeText: { textAlign: 'center', color: colors.textMuted, fontSize: 11.5, fontWeight: '600' },
  typeTextSelected: { color: colors.text, fontWeight: '800' },
  palette: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border },
  chosen: { borderWidth: 3, borderColor: colors.primary },
  assist: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 40 },
  assistText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
})
