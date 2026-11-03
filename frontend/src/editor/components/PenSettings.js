import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import FadeScroll from './controls/FadeScroll'
import { Pressable, StyleSheet, Text, View, Switch } from 'react-native'
import { colors } from '../../shared/theme'
import EditablePalette, { paletteSwatchStyles } from './controls/EditablePalette'
import Slider from './controls/Slider'
import { PEN_TYPES, penPressure } from '../utils/penSettings'
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
 * 펜·형광펜 설정. 스티커·마테·사진 옵션과 같은 모양: 구역 제목, 세그먼트 버튼, 막대(−·+·숫자), 기본 팔레트와 최근 사용 색.
 * 기본 팔레트는 편집기와 꾸미기 공방이 함께 사용한다.
 */
export default function PenSettings({ settings, onChange, onClose, straightAssist = true, onStraightAssistChange, onOpenColorPicker, sheet = false, dragHandlers }) {
  const highlighter = settings.kind === 'highlighter'
  const label = highlighter ? '형광펜' : '펜'
  const recentColors = useRecentPenColors(highlighter ? 'highlighter' : 'pen')
  const chooseColor = (color) => onChange({ ...settings, color })
  return <View style={sheet ? [toolPanelStyles.card, toolPanelStyles.sheetCard] : toolPanelStyles.card}>
    <ToolPanelHeader icon={highlighter ? 'highlighter' : 'pen'} title={label} closeLabel={`${label} 설정 닫기`} onClose={onClose} dragHandlers={dragHandlers} />
    <FadeScroll style={toolPanelStyles.scrollFrame} keyboardShouldPersistTaps="handled" contentContainerStyle={toolPanelStyles.content}>
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
      <EditablePalette allowDirect scope={highlighter ? 'highlighter' : 'pen'} label={label} value={settings.color} onPick={chooseColor} onOpenEditor={onOpenColorPicker} />
      <Text style={toolPanelStyles.label}>마지막으로 사용했던 색</Text>
      <View accessibilityLabel={`${label} 최근 사용 색상`} style={paletteSwatchStyles.row}>
        {recentColors.map(color => <Pressable key={color} accessibilityRole="button"
          accessibilityLabel={`최근 사용한 ${label} 색상 ${color}`} accessibilityState={{ selected: settings.color === color }}
          onPress={() => chooseColor(color)} style={paletteSwatchStyles.cell}>
          <View style={[paletteSwatchStyles.dot,{backgroundColor:color},settings.color === color && paletteSwatchStyles.chosen]} />
        </Pressable>)}
        {!recentColors.length && <Text style={styles.recentEmpty}>필기에 사용한 색이 여기에 저장돼요.</Text>}
      </View>
      <View style={styles.assist}>
        <Text style={styles.assistText}>끝점을 길게 눌러 직선 만들기</Text>
        <Switch accessibilityLabel="끝점에서 길게 눌러 직선 만들기" value={straightAssist} onValueChange={onStraightAssistChange} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.surface} activeThumbColor={colors.surface} />
      </View>
    </FadeScroll>
  </View>
}

const styles = StyleSheet.create({
  recentEmpty: { color: colors.textMuted, fontSize: 12 },
  preview: { backgroundColor: '#FAFAF7', borderRadius: 12 },
  types: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 11, backgroundColor: colors.surfaceMuted },
  type: { flex: 1, borderRadius: 8, paddingVertical: 6 },
  typeSelected: { backgroundColor: colors.surface, boxShadow: '0px 1px 3px rgba(11, 23, 102, 0.07)' },
  typeText: { textAlign: 'center', color: colors.textMuted, fontSize: 11.5, fontWeight: '600' },
  typeTextSelected: { color: colors.text, fontWeight: '800' },
  assist: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 40 },
  assistText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
})
