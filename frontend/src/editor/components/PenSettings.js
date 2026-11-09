import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import { useEffect, useMemo, useRef, useState } from 'react'
import FadeScroll from './controls/FadeScroll'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SettingSwitch } from '../../diary/components/SettingRow'
import { colors } from '../../shared/theme'
import EditablePalette, { paletteSwatchStyles } from './controls/EditablePalette'
import Slider from './controls/Slider'
import { GLASS_FILMS, GLASS_SHEENS, PEN_TYPES, penDefaultOpacity } from '../utils/penSettings'
import { micaColor, sheenAutoColor } from '../utils/glassInk'
import { useRecentPenColors } from '../hooks/useRecentPenColors'
import { createPenSample } from '../utils/penSample'
import ObjectContent from './canvas/ObjectView'

export function PenSample({ settings, small = false }) {
  // 미리보기 그래픽 규칙: 획을 크게 만든 뒤 zoom 으로 줄이지 않고 보일 크기(k)로 바로 만든다.
  // 줄이면 연필 결(무늬 칸)이 픽셀보다 작아져 뿌옇게 뭉개진다(작은 종류 견본 0.2배)
  const [sampleWidth, setSampleWidth] = useState(settings.width)
  const latestWidth = useRef(settings.width), timer = useRef(null)
  latestWidth.current = settings.width
  useEffect(() => {
    if (small || settings.kind !== 'pencil') { setSampleWidth(settings.width); return }
    if (timer.current == null) timer.current = setTimeout(() => { timer.current = null; setSampleWidth(latestWidth.current) }, 100)
  }, [settings.width, settings.kind, small])
  useEffect(() => () => { if (timer.current != null) clearTimeout(timer.current) }, [])
  const width = settings.kind === 'pencil' && !small ? sampleWidth : settings.width
  const stroke = useMemo(() => createPenSample({ ...settings, width }, small), [settings, width, small])
  // 미리보기는 옵션 창 높이를 아끼려고 48(코덱스 2026-11-02: 82 → 56 칸)
  return <View pointerEvents="none" style={{ height: small ? 26 : 48, justifyContent: 'center', alignItems: 'center', opacity: settings.kind === 'pencil' ? settings.opacity ?? 1 : stroke.opacity ?? 1 }}>
    <ObjectContent object={stroke} zoom={1} showFallbackWhileLoading />
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
      {/* 유리펜 잉크: 글리터 · 테를 따로 켜고 끈다. 글리터 색은 운모 코팅 두께(실제 펄 안료와 같은 원리) */}
      {settings.kind === 'glass' && <>
        <View style={styles.assist}>
          <Text style={styles.assistText}>글리터</Text>
          <SettingSwitch label="글리터" on={settings.inkGlitter !== false} onToggle={(on) => onChange({ ...settings, inkGlitter: on })} />
        </View>
        {settings.inkGlitter !== false && <>
          <Text style={toolPanelStyles.label}>글리터 색</Text>
          <View accessibilityLabel="글리터 색" style={paletteSwatchStyles.row}>
            {GLASS_FILMS.map((film) => {
              const rgb = micaColor(film.id).map(v => Math.round(Math.min(1, Math.max(0, v)) * 255))
              return <Pressable key={film.id} accessibilityRole="button" accessibilityLabel={`글리터 색 ${film.label}`}
                accessibilityState={{ selected: (settings.inkFilm ?? 55) === film.id }} hitSlop={1}
                onPress={() => onChange({ ...settings, inkFilm: film.id })} style={paletteSwatchStyles.cell}>
                <View style={[paletteSwatchStyles.dot, { backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` }, (settings.inkFilm ?? 55) === film.id && paletteSwatchStyles.chosen]} />
              </Pressable>
            })}
          </View>
          <Slider name="반짝임" label="글리터 반짝임" minusLabel="반짝임 약하게" plusLabel="반짝임 세게" min={0} max={100} step={10}
            value={Math.round((settings.inkAmount ?? 1) * 100)} onChange={(value) => onChange({ ...settings, inkAmount: Math.round(value / 10) * 10 / 100 })} />
        </>}
        <View style={styles.assist}>
          <Text style={styles.assistText}>테(쉰)</Text>
          <SettingSwitch label="테(쉰)" on={settings.inkSheen !== false} onToggle={(on) => onChange({ ...settings, inkSheen: on })} />
        </View>
        {settings.inkSheen !== false && <>
          <Slider name="테 세기" label="테 세기" minusLabel="테 약하게" plusLabel="테 세게" min={0} max={100} step={10}
            value={Math.round((settings.inkSheenAmount ?? 1) * 100)} onChange={(value) => onChange({ ...settings, inkSheenAmount: Math.round(value / 10) * 10 / 100 })} />
          <Text style={toolPanelStyles.label}>테 색 — 맨 앞은 펜 색에서 자동 계산</Text>
          <View accessibilityLabel="테 색" style={paletteSwatchStyles.row}>
            {[{ id: null, label: '자동' }, ...GLASS_SHEENS].map((one) => {
              const auto = one.id == null
              const rgb = auto ? sheenAutoColor([1, 3, 5].map(i => parseInt(settings.color.slice(i, i + 2), 16) / 255)).map(v => Math.round(Math.min(1, Math.max(0, v)) * 255)) : null
              const chosen = (settings.inkSheenColor ?? null) === one.id
              return <Pressable key={one.label} accessibilityRole="button" accessibilityLabel={`테 색 ${one.label}`}
                accessibilityState={{ selected: chosen }} hitSlop={1}
                onPress={() => onChange({ ...settings, inkSheenColor: one.id })} style={paletteSwatchStyles.cell}>
                <View style={[paletteSwatchStyles.dot, { backgroundColor: auto ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : one.id }, chosen && paletteSwatchStyles.chosen]} />
              </Pressable>
            })}
          </View>
        </>}
      </>}
      <EditablePalette allowDirect scope={highlighter ? 'highlighter' : 'pen'} label={label} value={settings.color} onPick={chooseColor} onOpenEditor={onOpenColorPicker} />
      {recentColors.length > 0 && <>
      <Text style={toolPanelStyles.label}>마지막으로 사용했던 색</Text>
      <View accessibilityLabel={`${label} 최근 사용 색상`} style={paletteSwatchStyles.row}>
        {recentColors.map(color => <Pressable key={color} accessibilityRole="button"
          accessibilityLabel={`최근 사용한 ${label} 색상 ${color}`} accessibilityState={{ selected: settings.color === color }}
          hitSlop={1} onPress={() => chooseColor(color)} style={paletteSwatchStyles.cell}>
          <View style={[paletteSwatchStyles.dot,{backgroundColor:color},settings.color === color && paletteSwatchStyles.chosen]} />
        </Pressable>)}
      </View>
      </>}
      <View style={styles.assist}>
        <Text style={styles.assistText}>직선 만들기</Text>
        <SettingSwitch label="직선 만들기" on={straightAssist} onToggle={onStraightAssistChange} />
      </View>
    </FadeScroll>
  </View>
}

const styles = StyleSheet.create({
  preview: { backgroundColor: '#FAFAF7', borderRadius: 12 },
  // 제목을 왼쪽에 붙인 한 줄(펜 종류 · 끝 모양): 막대의 제목 칸과 같은 폭 52
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fill: { flex: 1 },
  inlineLabel: { width: 52, color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  types: { flex: 1, flexDirection: 'row', gap: 4 },
  type: { flex: 1, minHeight: 48, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, paddingVertical: 6, paddingHorizontal: 1 },
  // 테두리 2 = 여백 1 줄임(칸 폭 · 글자 자리가 고를 때마다 움직이지 않게)
  typeSelected: { borderWidth: 2, paddingVertical: 5, paddingHorizontal: 0, borderColor: colors.primaryStrong }, // 페이지 목록 탭과 같은 선택 표시(테두리 2)
  typeText: { textAlign: 'center', color: colors.textMuted, fontSize: 11.5, fontWeight: '600' },
  typeTextSelected: { color: colors.text, fontWeight: '800' },
  assist: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 40 },
  assistText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
})
