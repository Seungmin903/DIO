import { useRef } from 'react'
import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import FadeScroll from './controls/FadeScroll'
import { Pressable, StyleSheet, Text, View, Switch } from 'react-native'
import { colors } from '../../shared/theme'
import MyColorPresets from './controls/MyColorPresets'
import Slider from './controls/Slider'
import { EDITOR_COLORS, HIGHLIGHTER_COLORS, PEN_TYPES, penDefaultOpacity, penPressure } from '../utils/penSettings'
import { usePalette } from '../hooks/usePalettes'
import { useRecentPenColors } from '../hooks/useRecentPenColors'
import { createStroke } from '../utils/strokes'
import ObjectContent from './canvas/ObjectView'

export function PenSample({ settings, small = false }) {
  // 미리보기 그래픽 규칙: 획을 크게 만든 뒤 zoom 으로 줄이지 않고 보일 크기(k)로 바로 만든다.
  // 줄이면 연필 결(무늬 칸)이 픽셀보다 작아져 뿌옇게 뭉개진다(작은 종류 견본 0.2배)
  const k = small ? 0.2 : 0.95
  // 종류 칸 견본(코덱스 2026-11-02): 48 × 26 칸에 x 4~44, 진폭 5 인 한 주기 — 캘리펜 굵기 변화 · 붓펜 끝이 보이게
  const points = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40, wave = Math.sin(t * Math.PI * 2)
    const x = small ? 4 + t * 40 : (12 + t * 240) * k
    const y = small ? 13 + wave * 5 : (settings.kind === 'highlighter' ? 24 : 24 + wave * 12) * k
    return { x, y, pressure: penPressure(settings.kind, 0.5 + Math.sin(t * Math.PI) * 1.1) }
  })
  const stroke = createStroke(points, { ...settings, width: settings.width * k })
  // 미리보기는 옵션 창 높이를 아끼려고 48(코덱스 2026-11-02: 82 → 56 칸)
  return <View pointerEvents="none" style={{ height: small ? 26 : 48, justifyContent: 'center', alignItems: 'center', opacity: stroke.opacity ?? 1 }}>
    <ObjectContent object={stroke} zoom={1} />
  </View>
}

/**
 * 펜·형광펜 설정. 스티커·마테·사진 옵션과 같은 모양: 구역 제목, 세그먼트 버튼, 막대(−·+·숫자), 색 한 줄, 내 색상.
 * 내 색상은 펜·형광펜이 각자 따로 저장한다 (controls/MyColorPresets).
 */
export default function PenSettings({ settings, onChange, onClose, straightAssist = true, onStraightAssistChange, onOpenColorPicker, pickerVisible = false, sheet = false, dragHandlers }) {
  const root = useRef(null)
  const anchor = useRef(null)
  const highlighter = settings.kind === 'highlighter'
  const label = highlighter ? '형광펜' : '펜'
  const recentColors = useRecentPenColors(highlighter ? 'highlighter' : 'pen')
  // 색 줄은 꾸미기 공방 '내 프리셋'에서 바꾼 목록을 따른다(바꾼 적 없으면 기본 색)
  const palette = usePalette?.(highlighter ? 'highlighter' : 'pen')?.colors ?? (highlighter ? HIGHLIGHTER_COLORS : EDITOR_COLORS)
  const chooseColor = (color) => onChange({ ...settings, color })
  return <View ref={root} collapsable={false} style={sheet ? [toolPanelStyles.card, toolPanelStyles.sheetCard] : toolPanelStyles.card}
    onLayout={() => root.current?.measureInWindow?.((x, y, width, height) => {
      if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) anchor.current = { x, y, width, height }
    })}>
    <ToolPanelHeader icon={highlighter ? 'highlighter' : 'pen'} title={label} closeLabel={`${label} 설정 닫기`} onClose={onClose} dragHandlers={dragHandlers} />
    <FadeScroll style={toolPanelStyles.scrollFrame} keyboardShouldPersistTaps="handled" contentContainerStyle={toolPanelStyles.content}>
      <View accessibilityLabel={`${label} 미리보기`} style={styles.preview}><PenSample settings={settings} /></View>
      <View style={styles.inlineRow}>
      <Text style={styles.inlineLabel}>{highlighter ? '끝 모양' : '종류'}</Text>
      {highlighter ? (
        <View style={styles.fill}><Segmented
          items={[{ id: 'round', label: '라운드' }, { id: 'square', label: '스퀘어' }]}
          selected={(id) => settings.lineCap === id}
          onPress={(id) => onChange({ ...settings, lineCap: id })}
        /></View>
      ) : (
        <View style={styles.types}>{PEN_TYPES.map((type) => (
          <Pressable key={type.id} accessibilityRole="button" accessibilityLabel={type.label} accessibilityState={{ selected: settings.kind === type.id }}
            onPress={() => onChange({ ...settings, kind: type.id, opacity: penDefaultOpacity(type.id) })} style={[styles.type, settings.kind === type.id && styles.typeSelected]}>
            <PenSample settings={{ ...settings, kind: type.id, width: 10 }} small /><Text style={[styles.typeText, settings.kind === type.id && styles.typeTextSelected]}>{type.label}</Text>
          </Pressable>
        ))}</View>
      )}
      </View>
      <Slider name="굵기" label={highlighter ? '형광펜 굵기' : '펜 굵기'} minusLabel={`${label} 가늘게`} plusLabel={`${label} 굵게`} min={highlighter ? 8 : 1} max={highlighter ? 40 : 16} step={0.5} value={settings.width} onChange={(width) => onChange({ ...settings, width: Math.round(width * 2) / 2 })} />
      {/* 펜만: 굵기처럼 불투명도를 정한다(10~100%). 형광펜은 정해진 뽀얀 농도를 쓴다 */}
      {!highlighter && <>
        <Slider name="불투명도" label="펜 불투명도" minusLabel="펜 더 투명하게" plusLabel="펜 더 진하게" min={10} max={100} step={5} value={Math.round((settings.opacity ?? 1) * 100)}
          onChange={(value) => onChange({ ...settings, opacity: Math.round(value / 5) * 5 / 100 })} />
      </>}
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
    </FadeScroll>
  </View>
}

const styles = StyleSheet.create({
  recentPalette: { justifyContent: 'flex-start', gap: 6 },
  recentEmpty: { color: colors.textMuted, fontSize: 12 },
  preview: { backgroundColor: '#FAFAF7', borderRadius: 12 },
  // 제목을 왼쪽에 붙인 한 줄(펜 종류 · 끝 모양): 막대의 제목 칸과 같은 폭 52
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fill: { flex: 1 },
  inlineLabel: { width: 52, color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  types: { flex: 1, flexDirection: 'row', gap: 4, padding: 3, borderRadius: 11, backgroundColor: colors.surfaceMuted },
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
