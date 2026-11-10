import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { colors, shadow } from '../../shared/theme'
import { TEXT_COLORS, fontLabel, getPickableTextFonts, getTextFonts, italicTransform, resolveFontId, subscribeTextFonts, textFontChangePatch, textFontStateSnapshot, textStyle, textStyleReady, textStyleSupport } from '../utils/text'
import { usePalette } from '../hooks/usePalettes'
import { useColorWindow } from '../../diary/components/PresetColorEditor'
import { paperColorRow } from '../utils/paperColorRow.js'
import { recordPaperColor, usePaperColorRecents } from '../hooks/usePaperColorRecents.js'
import Icon from './controls/Icon'
import FadeScroll from './controls/FadeScroll'

export const TEXT_FORMAT_STRIP_HEIGHT = 52
const ROW_GAP = 6

// 웹: 버튼을 눌러도 입력창의 포커스가 풀리지 않게 한다(TextActionBar 와 같다)
const keepFocus = { onMouseDown: (event) => event.preventDefault?.() }
// 무지개 고리: 색 고르기 버튼. 가운데 점이 지금 글자 색
const RAINBOW = ['#E9573F', '#F6B93B', '#4F9D69', '#3B82C4', '#7C5CBF', '#D4559A']
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits
// 글꼴 이름을 그 글꼴로 보여 준다(아직 불러오지 못한 앱 글꼴은 기본 글꼴) — TextFontDropdown 과 같다
const previewFont = (id) => ({ fontFamily: textStyle({ font: id }, 1, Platform.OS).fontFamily })

/**
 * 글을 고치는 동안 키보드 바로 위(웹은 작업창 아래 끝)에 늘 떠 있는 **상자 전체** 서식 줄(S15P31F106-482). 켜고 끄는 버튼은 없다(자동으로 열리니 끄기만 남아 쓸모가 없었다, 2026-11-10).
 * 한 줄: 글꼴(지금 글꼴 이름, 누르면 위에 글꼴 칩 줄) · 굵게/기울임/밑줄/취소선 · 색(무지개 고리, 누르면 위에 색 견본 줄) · 자간 −/+ · 줄간격 −/+. 좁으면 가로로 민다.
 * 정렬은 두지 않는다 — 글자 폭에 맞는 상자에서는 차이가 없어 혼란만 줬다(실기 피드백). 상자를 고른 뒤 서식 창에서 바꾼다. 글꼴 칩 · 색 견본을 고르면 그 줄은 닫혀 글상자가 보인다.
 * 글자 크기 −/+ 도 여기 둔다 — 상자 위 막대는 상자 동작(완료 · 복제 · 삭제)만, 이 줄은 글자 모양 전부(2026-11-10). 자간 · 줄간격은 숫자 없이 이름과 −/+ 만(단위 없는 숫자는 뜻이 안 보였고 효과는 상자에 바로 보인다). 글꼴 · 색은 따로 뜨는 창(Modal) 대신 줄 위에 펼친다 — 창이 뜨면 iOS 키보드가 내려가고 글상자 편집이 끝난다.
 * 글자를 고른 동안은 '선택한 글자' 줄(TextRangePanel)이 이 자리를 쓰고 이 줄은 숨는다(적용 대상이 겹치지 않게). 숫자 입력 칸은 두지 않는다(다른 입력에 포커스가 가면 고치던 글상자가 닫힌다).
 * 색 줄은 팔레트 7칸 + `직접 고르기`(+). 직접 고른 색은 기기에 기억돼(usePaperColorRecents 'text') 왼쪽에서 들어오고 오른쪽 끝 색이 밀려난다(paperColorRow, 속지 색 줄과 같다).
 * + 는 색 창(PresetColorEditor, `완료` 버튼)을 띄운다 — 창이 떠 있는 동안 onHold(true) 로 알려 글상자 편집이 끝나지 않게 하고, 닫히면 onHold(false). 글꼴 칩을 고르면 글꼴 줄은 닫혀 글상자가 보인다.
 * settings: textSettings(고치는 상자), onChange(patch): 상자에 바로 적용(EditorScreen.changeTextSettings). defaultPanel: 처음부터 펼쳐 둘 줄('font' | 'color', 테스트용)
 */
export default function TextFormatStrip({ settings, onChange, onHold = () => {}, style, defaultPanel = null }) {
  const [panel, setPanel] = useState(defaultPanel)
  const colorWindow = useColorWindow()
  const customAnchor = useRef(null)
  // 색 창이 떠 있는 채 서식 줄이 사라지면(글자를 골라 '선택한 글자' 줄로 바뀜 등) 창의 닫기가 오지 않으니 보류를 여기서 푼다(MR !505 리뷰)
  const holdRef = useRef(onHold)
  holdRef.current = onHold
  const heldOpen = useRef(false)
  heldOpen.current = colorWindow.isOpen
  useEffect(() => () => { if (heldOpen.current) holdRef.current(false) }, [])
  const openCustomColor = () => {
    onHold(true)
    colorWindow.open(customAnchor, { title: '글자 색', value: settings.color, original: settings.color, doneLabel: '완료',
      onChange: (color) => onChange({ color }), onDone: (color) => { onChange({ color }); recordPaperColor('text', color); onHold(false) }, onClose: () => onHold(false) })
  }
  const recentColors = usePaperColorRecents('text')
  const textColors = usePalette?.('text')?.colors ?? TEXT_COLORS
  const support = textStyleSupport(settings.font, Platform.OS)
  const boldReady = support.bold && textStyleReady(settings.font, 'bold')
  const toggle = (key, enabled = true) => () => { if (enabled) onChange({ [key]: !settings[key] }) }
  // 보이는 견본: 직접 고른 최근 색 → 팔레트 순으로 팔레트 칸 수만큼. 지금 색은 늘 보인다
  const colorRow = paperColorRow(recentColors, textColors.map(color => [color, color]), settings.color, textColors.length)
  // 견본에 없는 색을 쓰고 있으면 직접 고르기 칸이 골라진 것으로 보인다
  const customColorOn = Boolean(settings.color) && !colorRow.some(item => item.color === settings.color.toUpperCase())
  // 글꼴 목록 · 불러오기 상태가 바뀌면 다시 그린다(미리보기 글자가 늦게 온 글꼴로 바뀐다)
  useSyncExternalStore(subscribeTextFonts, textFontStateSnapshot, textFontStateSnapshot)
  const fonts = getTextFonts(), currentFontId = resolveFontId(settings.font)
  const currentFont = fonts.find(font => font.id === currentFontId) ?? fonts[0]
  const flip = (next) => setPanel(current => current === next ? null : next)
  // 글꼴 칩 줄이 열릴 때 지금 글꼴 칩이 보이게 스크롤한다(글꼴이 늘면 오른쪽 밖에 있을 수 있다)
  const fontScroll = useRef(null)
  return (
    <View style={[styles.wrap, style]} accessibilityLabel="글상자 서식">
      {panel === 'font' && (
        <View style={styles.bar} accessibilityLabel="글꼴 고르기">
          <FadeScroll horizontal scrollRef={fontScroll} style={styles.scroll} keyboardShouldPersistTaps="always" contentContainerStyle={styles.content}>
            {getPickableTextFonts().map(font => {
              const on = font.id === currentFont?.id
              return <Pressable key={font.id} accessibilityRole="button" accessibilityLabel={`글꼴 ${fontLabel(font, Platform.OS)}`} accessibilityState={{ selected: on }} {...keepFocus}
                onLayout={on ? (event) => fontScroll.current?.scrollTo?.({ x: Math.max(0, event.nativeEvent.layout.x - 48), animated: false }) : undefined}
                onPress={() => { onChange(textFontChangePatch(settings, font.id, Platform.OS)); setPanel(null) }} style={[styles.chip, on && styles.active]}>
                <Text style={[styles.chipText, previewFont(font.id)]} numberOfLines={1}>{fontLabel(font, Platform.OS)}</Text>
              </Pressable>
            })}
          </FadeScroll>
        </View>
      )}
      {panel === 'color' && (
        <View style={styles.bar} accessibilityLabel="글자 색 견본">
          <FadeScroll horizontal style={styles.scroll} keyboardShouldPersistTaps="always" contentContainerStyle={styles.content}>
            {colorRow.map(({ color }) => {
              const on = settings.color?.toUpperCase() === color
              return <Pressable key={color} accessibilityRole="button" accessibilityLabel={`글자 색 ${color}`} accessibilityState={{ selected: on }} {...keepFocus}
                onPress={() => { onChange({ color }); setPanel(null) }} style={[styles.swatch, { backgroundColor: color }, on && styles.chosen]} />
            })}
            <Pressable ref={customAnchor} collapsable={false} accessibilityRole="button" accessibilityLabel="글자 색 직접 고르기" accessibilityState={{ expanded: colorWindow.isOpen, selected: customColorOn }} {...keepFocus}
              onPress={openCustomColor} style={[styles.swatch, styles.custom, customColorOn && styles.chosen]}>
              <Icon name="plus" size={14} color={colors.textMuted} />
            </Pressable>
          </FadeScroll>
        </View>
      )}
      {/* 색 창은 색 줄 밖에 둔다 — 줄을 닫아도 창이 사라지지 않고 확정 · 닫기가 와서 보류가 풀린다 */}
      {colorWindow.element}
      <View style={styles.bar}>
        <FadeScroll horizontal style={styles.scroll} keyboardShouldPersistTaps="always" contentContainerStyle={styles.content}>
          <Pressable accessibilityRole="button" accessibilityLabel={`글꼴 ${currentFont ? fontLabel(currentFont, Platform.OS) : ''}`} accessibilityState={{ expanded: panel === 'font' }} {...keepFocus}
            onPress={() => flip('font')} style={[styles.fontButton, panel === 'font' && styles.active]}>
            <Text style={[styles.fontText, currentFont && previewFont(currentFont.id)]} numberOfLines={1}>{currentFont ? fontLabel(currentFont, Platform.OS) : '글꼴'}</Text>
            <Svg width={12} height={12} viewBox="0 0 24 24"><Path d={panel === 'font' ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'} fill="none" stroke={colors.textMuted} strokeWidth={2} /></Svg>
          </Pressable>
          <View style={styles.divider} />
          <Stepper label="크기" shown={String(settings.fontSize)} minusLabel="글씨 축소" plusLabel="글씨 확대" onStep={(delta) => onChange({ fontSize: clamp(settings.fontSize + delta * 2, 8, 96) })} />
          <View style={styles.divider} />
          <View style={styles.glyphGroup}>
          <GlyphButton label="굵게" active={Boolean(settings.bold) && boldReady} disabled={!boldReady} onPress={toggle('bold', boldReady)}><Text style={[styles.glyph, { fontWeight: '800' }]}>B</Text></GlyphButton>
          <GlyphButton label="기울임" active={Boolean(settings.italic)} onPress={toggle('italic')}><Text style={[styles.glyph, { transform: italicTransform() }]}>I</Text></GlyphButton>
          <GlyphButton label="밑줄" active={Boolean(settings.underline)} onPress={toggle('underline')}><LinedGlyph letter="U" line="under" /></GlyphButton>
          <GlyphButton label="취소선" active={Boolean(settings.strike)} onPress={toggle('strike')}><LinedGlyph letter="S" line="through" /></GlyphButton>
          </View>
          <View style={styles.divider} />
          <Pressable accessibilityRole="button" accessibilityLabel="글자 색 고르기" accessibilityState={{ expanded: panel === 'color' }} {...keepFocus} onPress={() => flip('color')} style={[styles.iconButton, panel === 'color' && styles.active]}>
            <RainbowRing color={settings.color} />
          </Pressable>
          <View style={styles.divider} />
          <Stepper label="자간" shown={String(Math.round(settings.letterSpacing * 100))} minusLabel="자간 좁게" plusLabel="자간 넓게"
            onStep={(delta) => onChange({ letterSpacing: round(clamp(settings.letterSpacing + delta * 0.01, -0.1, 0.5), 2) })} />
          <Stepper label="줄간격" shown={String(Math.round(settings.lineSpacing * 100))} minusLabel="줄간격 좁게" plusLabel="줄간격 넓게"
            onStep={(delta) => onChange({ lineSpacing: round(clamp(settings.lineSpacing + delta * 0.05, 1, 2.5), 2) })} />
        </FadeScroll>
      </View>
    </View>
  )
}

/** 얇은 무지개 고리 + 가운데 큰 지금 색 점(점이 작으면 지금 색을 알아보기 어려웠다, 2026-11-10) */
function RainbowRing({ color }) {
  const r = 11, c = 12
  const arc = (index) => {
    const a0 = (index / RAINBOW.length) * Math.PI * 2 - Math.PI / 2, a1 = ((index + 1) / RAINBOW.length) * Math.PI * 2 - Math.PI / 2
    const x0 = c + r * Math.cos(a0), y0 = c + r * Math.sin(a0), x1 = c + r * Math.cos(a1), y1 = c + r * Math.sin(a1)
    return `M${c} ${c} L${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`
  }
  return <Svg width={24} height={24} viewBox="0 0 24 24">
    {RAINBOW.map((fill, index) => <Path key={fill} d={arc(index)} fill={fill} />)}
    <Circle cx={c} cy={c} r={7.5} fill={color ?? colors.text} stroke="#FFFFFF" strokeWidth={1.5} />
  </Svg>
}

/** 이름 · − · 값 · + — 입력 칸 없음(값은 서식 창 숫자 칸처럼 테두리 칸에 담는다). 자간 · 줄간격 값은 서식 창(TextSettings)과 같은 숫자(×100, 단위 없음)로 보인다(실기 피드백 2026-11-10: 크기처럼 숫자가 보이길 원했다) */
function Stepper({ label, shown = null, minusLabel, plusLabel, onStep }) {
  return (
    <View style={styles.stepper} accessibilityLabel={label}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={minusLabel} {...keepFocus} onPress={() => onStep(-1)} style={styles.stepButton}><Icon name="minus" size={14} color={colors.text} /></Pressable>
      {shown != null && <View style={styles.valueBox}><Text style={styles.stepperValue} accessibilityLabel={`글자 ${label} ${shown}`}>{shown}</Text></View>}
      <Pressable accessibilityRole="button" accessibilityLabel={plusLabel} {...keepFocus} onPress={() => onStep(1)} style={styles.stepButton}><Icon name="plus" size={14} color={colors.text} /></Pressable>
    </View>
  )
}

/** 굵게 · 기울임 · 밑줄 · 취소선: 서식 창 스타일 칸(Segmented)과 같은 테두리 칩 — 켜진 칸은 primaryStrong 테두리(실기 피드백 2026-11-10: 통일감) */
function GlyphButton({ label, active, disabled = false, onPress, children }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: Boolean(active), disabled }} disabled={disabled} {...keepFocus} onPress={onPress}
      style={[styles.glyphChip, active && styles.glyphChipOn, disabled && styles.disabled]}>
      {children}
    </Pressable>
  )
}

/** 글자 하나 + 직접 그은 선(밑줄 · 취소선). TextSettings 와 같은 모양 */
function LinedGlyph({ letter, line }) {
  return <View style={styles.lined}>
    <Text style={styles.glyph}>{letter}</Text>
    <View style={[styles.linedLine, line === 'under' ? { bottom: 1 } : { top: '50%', marginTop: -0.6 }]} />
  </View>
}

// 선택한 글자 줄(TextRangePanel)과 같은 크기 · 모양. 글꼴 · 색 줄은 위에 같은 모양으로 쌓인다
// 칸 사이 여백은 좁게 — 자간 · 줄간격 숫자를 넣은 뒤 iPad 에서 줄간격 + 가 잘려 밀어야 보였다(실기 피드백 2026-11-10). 누르는 칸 높이 36 은 그대로
const styles = StyleSheet.create({
  wrap: { maxWidth: '100%', alignItems: 'center', gap: ROW_GAP },
  bar: { height: TEXT_FORMAT_STRIP_HEIGHT, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', borderRadius: 16, backgroundColor: colors.surface, ...shadow.float },
  scroll: { flexShrink: 1 },
  content: { alignItems: 'center', gap: 1, paddingHorizontal: 6 },
  fontButton: { height: 36, minWidth: 84, maxWidth: 128, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, borderRadius: 9 },
  fontText: { flexShrink: 1, fontSize: 13.5, color: colors.text },
  chip: { height: 36, paddingHorizontal: 12, borderRadius: 9, justifyContent: 'center', maxWidth: 160 },
  chipText: { fontSize: 13.5, color: colors.text },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2, marginHorizontal: 1 },
  stepperLabel: { fontSize: 11.5, fontWeight: '700', color: colors.textMuted, marginRight: 2 },
  stepButton: { width: 28, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  // 숫자 칸: 서식 창 NumberStepper 입력 칸과 같은 흰 면 + 1px 테두리(높이는 −/+ 와 같은 36)
  valueBox: { minWidth: 32, height: 36, paddingHorizontal: 3, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { textAlign: 'center', fontSize: 13, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  iconButton: { width: 34, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  active: { backgroundColor: colors.primarySoft },
  glyphGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // 고른 칸은 테두리가 2로 두꺼워지는 만큼 안쪽 여백을 1 줄여 글자가 움직이지 않게(ToolPanel segmentItem 과 같다)
  glyphChip: { width: 32, height: 36, borderRadius: 9, borderWidth: 1, padding: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  glyphChipOn: { borderWidth: 2, padding: 0, borderColor: colors.primaryStrong },
  disabled: { opacity: 0.4 },
  glyph: { fontSize: 15, fontWeight: '700', color: colors.text },
  lined: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  linedLine: { position: 'absolute', left: 0, right: 0, height: 1.2, backgroundColor: colors.text },
  swatch: { width: 26, height: 26, borderRadius: 13, marginHorizontal: 3, borderWidth: 1, borderColor: colors.border },
  // 직접 고르기(+): 점선 테두리의 빈 칸. 견본에 없는 색을 쓰고 있으면 이 칸이 골라진 것으로 보인다
  custom: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', backgroundColor: colors.surface },
  chosen: { borderWidth: 3, borderColor: colors.primary },
  divider: { width: 1, height: 22, marginHorizontal: 3, backgroundColor: colors.border },
})
