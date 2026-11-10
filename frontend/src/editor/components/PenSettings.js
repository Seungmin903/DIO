import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import { useEffect, useMemo, useRef, useState } from 'react'
import FadeScroll from './controls/FadeScroll'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SettingSwitch } from '../../diary/components/SettingRow'
import { colors } from '../../shared/theme'
import ChipScroller, { justDragged } from './controls/ChipScroller'
import { glassColors, glassEntry } from '../hooks/usePalettes'
import EditablePalette, { GlassDot, glassResolved, paletteSwatchStyles } from './controls/EditablePalette'
import Slider from './controls/Slider'
import Icon from './controls/Icon'
import { GLASS_FILMS, GLASS_SHEENS, PEN_TYPES, penDefaultOpacity } from '../utils/penSettings'
import { glitterColorOf, micaColor, sheenAutoColor } from '../utils/glassInk'
import { DASH_TYPES, DASH_LENGTH_RANGE, DASH_GAP_RANGE, dashPattern, isDashedKind } from '../utils/dashedStroke'
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
const to255 = v => Math.round(Math.min(1, Math.max(0, v)) * 255)
const rgbCss = rgb => `rgb(${to255(rgb[0])}, ${to255(rgb[1])}, ${to255(rgb[2])})`
const rgbHex = rgb => '#' + rgb.map(v => to255(v).toString(16).padStart(2, '0').toUpperCase()).join('')
// 글자를 얹을 칸의 글자색(배경이 어두우면 흰 글자)
const darkCss = css => { const n = css.match(/\d+/g)?.map(Number) ?? [255, 255, 255]; return 0.299 * n[0] + 0.587 * n[1] + 0.114 * n[2] < 150 }

/**
 * 잉크 색 한 줄: [맞춤] + 견본들 + [직접 고르기].
 * 다이어리 표지의 색 줄과 같은 차례다(맨 앞이 맞춤, 맨 끝이 사용자 지정).
 */
function InkColorRow({ label, autoColor, autoOn, onAuto, items, customOn, customCss, onCustom }) {
  return <>
    <Text style={toolPanelStyles.label}>{label}</Text>
    <View accessibilityLabel={label} style={paletteSwatchStyles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} 맞춤`} accessibilityState={{ selected: autoOn }}
        hitSlop={1} onPress={onAuto} style={paletteSwatchStyles.cell}>
        <View style={[paletteSwatchStyles.dot, { backgroundColor: autoColor, alignItems: 'center', justifyContent: 'center' }, autoOn && paletteSwatchStyles.chosen]}>
          <Text allowFontScaling={false} numberOfLines={1} style={[styles.autoText, { color: darkCss(autoColor) ? '#FFFFFF' : colors.text }]}>맞춤</Text>
        </View>
      </Pressable>
      {items.map(one => <Pressable key={one.key} accessibilityRole="button" accessibilityLabel={`${label} ${one.label}`}
        accessibilityState={{ selected: one.on }} hitSlop={1} onPress={one.onPress} style={paletteSwatchStyles.cell}>
        <View style={[paletteSwatchStyles.dot, { backgroundColor: one.css }, one.on && paletteSwatchStyles.chosen]} />
      </Pressable>)}
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} 직접 고르기`} hitSlop={1} onPress={onCustom} style={paletteSwatchStyles.cell}>
        <View style={[paletteSwatchStyles.dot, { backgroundColor: customOn ? customCss : colors.surface, alignItems: 'center', justifyContent: 'center' }, customOn && paletteSwatchStyles.chosen]}>
          {!customOn && <Icon name="plus" size={17} color={colors.primaryText} />}
        </View>
      </Pressable>
    </View>
  </>
}

export default function PenSettings({ settings, onChange, onClose, straightAssist = true, onStraightAssistChange, onOpenColorPicker, sheet = false, dragHandlers }) {
  const highlighter = settings.kind === 'highlighter'
  const dashed = isDashedKind(settings.kind)
  const selectedKind = dashed ? 'dashed' : settings.kind
  const pattern = dashed ? dashPattern(settings.kind, settings) : null
  const label = highlighter ? '형광펜' : '펜'
  const recentColors = useRecentPenColors(highlighter ? 'highlighter' : 'pen')
  const [reveal, setReveal] = useState(null)   // 고른 종류가 가려지지 않게 그 자리로 넘긴다
  const penRgb = useMemo(() => [1, 3, 5].map(i => parseInt(settings.color.slice(i, i + 2), 16) / 255), [settings.color])
  // 유리펜은 한 칸에 잉크 · 글리터 · 테 색을 함께 담는다(마스킹 테이프와 같은 방식).
  // 그래서 칸을 고르면 세 가지가 한꺼번에 들어온다.
  const glassPen = settings.kind === 'glass'
  const paletteScope = highlighter ? 'highlighter' : glassPen ? 'glass' : isDashedKind(settings.kind) ? 'dashed' : 'pen'
  const paletteValue = glassPen ? glassEntry({ ink: settings.color, glitter: settings.inkGlitterColor, sheen: settings.inkSheenColor }) : settings.color
  const chooseColor = (entry) => {
    // 묶음('잉크:글리터:테')이면 셋 다 바꾸고, 색 하나면 잉크만 바꾼다
    // (최근 색 · 직접 고르기로 색만 바꿀 때 글리터 · 테 선택이 날아가지 않게)
    if (!glassPen || !String(entry).includes(':')) return onChange({ ...settings, color: entry })
    const { ink, glitter, sheen } = glassColors(entry)
    onChange({ ...settings, color: ink, inkGlitterColor: glitter, inkSheenColor: sheen })
  }
  return <View style={sheet ? [toolPanelStyles.card, toolPanelStyles.sheetCard] : toolPanelStyles.card}>
    <ToolPanelHeader icon={highlighter ? 'highlighter' : 'pen'} title={label} closeLabel={`${label} 설정 닫기`} onClose={onClose} dragHandlers={dragHandlers} />
    <FadeScroll style={toolPanelStyles.scrollFrame} keyboardShouldPersistTaps="handled" contentContainerStyle={toolPanelStyles.content}>
      {/* 종류는 맨 위, 가로로 넘기는 한 줄(앱 공통 ChipScroller). 종류가 늘어도 패널 높이가
          그대로이고, 끝에 그라데이션이 있어 더 있다는 게 보인다. 격자로 두면 12개쯤에서
          네 줄이 되어 패널을 다 잡아먹는다(사용자 2026-11-10). 고른 칸은 보이게 넘겨 둔다. */}
      {highlighter ? (
        <View style={styles.inlineRow}>
          <Text style={styles.inlineLabel}>끝 모양</Text>
          <View style={styles.fill}><Segmented
            items={[{ id: 'round', label: '라운드' }, { id: 'square', label: '스퀘어' }]}
            selected={(id) => settings.lineCap === id}
            onPress={(id) => onChange({ ...settings, lineCap: id })}
          /></View>
        </View>
      ) : (<>
        <Text style={toolPanelStyles.label}>종류</Text>
        <ChipScroller style={styles.typeScroller} contentContainerStyle={styles.types} reveal={reveal}>
          {PEN_TYPES.map((type) => (
            <Pressable key={type.id} accessibilityRole="button" accessibilityLabel={type.label} accessibilityState={{ selected: selectedKind === type.id }}
              onLayout={selectedKind === type.id ? (event) => setReveal({ x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width }) : undefined}
              onPress={() => { if (justDragged()) return; onChange({ ...settings, kind: selectedKind === type.id ? settings.kind : type.id }) }}
              style={[styles.type, selectedKind === type.id && styles.typeSelected]}>
              <PenSample settings={{ ...settings, kind: type.id, width: 10 }} small /><Text style={[styles.typeText, selectedKind === type.id && styles.typeTextSelected]}>{type.label}</Text>
            </Pressable>
          ))}
        </ChipScroller>
      </>)}
      <View accessibilityLabel={`${label} 미리보기`} style={styles.preview}><PenSample settings={settings} /></View>
      {/* 색은 펜 종류와 무관하게 늘 쓰므로 종류 바로 아래에 고정한다(아래 옵션은 종류마다 개수가 달라 자리가 밀린다) */}
      <EditablePalette allowDirect scope={paletteScope} label={label} value={paletteValue} onPick={chooseColor} onOpenEditor={onOpenColorPicker} />
      {recentColors.length > 0 && <>
      <Text style={toolPanelStyles.label}>마지막으로 사용했던 색</Text>
      <View accessibilityLabel={`${label} 최근 사용 색상`} style={paletteSwatchStyles.row}>
        {recentColors.map(color => <Pressable key={color} accessibilityRole="button"
          accessibilityLabel={`최근 사용한 ${label} 색상 ${color}`} accessibilityState={{ selected: settings.color === color }}
          hitSlop={1} onPress={() => chooseColor(color)} style={paletteSwatchStyles.cell}>
          {/* 유리펜은 칸 안에서 실제 모습을 보여 준다(테 고리 · 잉크 면 · 글리터) — 팔레트 칸과 같은 그림 */}
          {glassPen
            ? (look => <View style={[paletteSwatchStyles.dot, { backgroundColor: look.sheen }, settings.color === color && paletteSwatchStyles.chosen]}><GlassDot look={look} /></View>)(glassResolved(color))
            : <View style={[paletteSwatchStyles.dot,{backgroundColor:color},settings.color === color && paletteSwatchStyles.chosen]} />}
        </Pressable>)}
      </View>
      </>}
      <Slider name="굵기" label={highlighter ? '형광펜 굵기' : '펜 굵기'} minusLabel={`${label} 가늘게`} plusLabel={`${label} 굵게`} min={highlighter ? 8 : 1} max={highlighter ? 40 : 16} step={0.5} value={settings.width} onChange={(width) => onChange({ ...settings, width: Math.round(width * 2) / 2 })} />
      {/* 펜만: 굵기처럼 불투명도를 정한다(10~100%). 형광펜은 정해진 뽀얀 농도를 쓴다 */}
      {!highlighter && <>
        <Slider name="불투명도" label="펜 불투명도" minusLabel="펜 더 투명하게" plusLabel="펜 더 진하게" min={10} max={100} step={5} value={Math.round((settings.opacity ?? 1) * 100)}
          onChange={(value) => onChange({ ...settings, opacity: Math.round(value / 5) * 5 / 100 })} />
      </>}
      {pattern && <>
        <Slider name="점 길이" label="점 길이" minusLabel="점 짧게" plusLabel="점 길게"
          {...DASH_LENGTH_RANGE} step={0.5} unit="배" value={pattern.dashLength}
          onChange={dashLength => onChange({ ...settings, dashLength: Math.round(dashLength * 2) / 2 })} />
        <Slider name="점 간격" label="점 간격" minusLabel="점 간격 좁게" plusLabel="점 간격 넓게"
          {...DASH_GAP_RANGE} step={0.5} unit="배" value={pattern.dashGap}
          onChange={dashGap => onChange({ ...settings, dashGap: Math.round(dashGap * 2) / 2 })} />
        <Segmented items={DASH_TYPES}
          selected={id => settings.kind === id}
          onPress={kind => onChange({ ...settings, kind })} />
      </>}
      {/* 유리펜 잉크. 색 줄은 다이어리 표지와 같은 모양이다 — 맨 앞이 '맞춤'(펜 색에서 자동 계산),
          그 뒤가 견본, 맨 끝이 직접 고르기. 세기는 스위치 없이 0(꺼짐)~100 숫자 하나로 정하고,
          세기를 색보다 위에 둔다(끄고 켜는 게 먼저라 — 사용자 2026-11-10). */}
      {settings.kind === 'glass' && <>
        <Slider name="글리터" label="글리터" minusLabel="글리터 약하게" plusLabel="글리터 세게" min={0} max={100} step={10}
          value={settings.inkGlitter === false ? 0 : Math.round((settings.inkAmount ?? 1) * 100)}
          onChange={(value) => { const amount = Math.round(value / 10) * 10 / 100; onChange({ ...settings, inkGlitter: amount > 0, inkAmount: amount }) }} />
        <InkColorRow label="글리터 색" autoColor={rgbCss(glitterColorOf(penRgb))} autoOn={settings.inkFilm == null && !settings.inkGlitterColor}
          onAuto={() => onChange({ ...settings, inkFilm: null, inkGlitterColor: null })}
          items={GLASS_FILMS.map(film => ({ key: film.id, label: film.label, css: rgbCss(micaColor(film.id, 1)),
            on: settings.inkFilm === film.id && !settings.inkGlitterColor,
            onPress: () => onChange({ ...settings, inkFilm: film.id, inkGlitterColor: null }) }))}
          customOn={Boolean(settings.inkGlitterColor)} customCss={settings.inkGlitterColor}
          onCustom={() => onOpenColorPicker?.({ title: '글리터 색', value: settings.inkGlitterColor ?? rgbHex(glitterColorOf(penRgb)),
            onDone: color => onChange({ ...settings, inkGlitterColor: color }) })} />
        <Slider name="테" label="테" minusLabel="테 약하게" plusLabel="테 세게" min={0} max={100} step={10}
          value={settings.inkSheen === false ? 0 : Math.round((settings.inkSheenAmount ?? 1) * 100)}
          onChange={(value) => { const amount = Math.round(value / 10) * 10 / 100; onChange({ ...settings, inkSheen: amount > 0, inkSheenAmount: amount }) }} />
        <InkColorRow label="테 색" autoColor={rgbCss(sheenAutoColor(penRgb))} autoOn={settings.inkSheenColor == null}
          onAuto={() => onChange({ ...settings, inkSheenColor: null })}
          items={GLASS_SHEENS.map(one => ({ key: one.id, label: one.label, css: one.id, on: settings.inkSheenColor === one.id,
            onPress: () => onChange({ ...settings, inkSheenColor: one.id }) }))}
          customOn={Boolean(settings.inkSheenColor) && !GLASS_SHEENS.some(one => one.id === settings.inkSheenColor)}
          customCss={settings.inkSheenColor}
          onCustom={() => onOpenColorPicker?.({ title: '테 색', value: settings.inkSheenColor ?? rgbHex(sheenAutoColor(penRgb)),
            onDone: color => onChange({ ...settings, inkSheenColor: color }) })} />
      </>}
      {/* 어느 펜을 골라도 마지막 줄은 이것 하나다 → 구분선 하나로 위쪽 '그리기 설정'과 나눈다 */}
      <View style={styles.divider} />
      <View style={styles.assist}>
        <Text style={styles.assistText}>끝점 꾹 눌러 직선 만들기</Text>
        <SettingSwitch label="끝점 꾹 눌러 직선 만들기" on={straightAssist} onToggle={onStraightAssistChange} />
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
  typeScroller: { marginHorizontal: -2 },
  types: { flexDirection: 'row', gap: 4, paddingHorizontal: 2 },
  type: { width: 74, minHeight: 52, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface, paddingVertical: 6, paddingHorizontal: 1 },
  // 테두리 2 = 여백 1 줄임(칸 폭 · 글자 자리가 고를 때마다 움직이지 않게)
  typeSelected: { borderWidth: 2, paddingVertical: 5, paddingHorizontal: 0, borderColor: colors.primaryStrong }, // 페이지 목록 탭과 같은 선택 표시(테두리 2)
  typeText: { textAlign: 'center', color: colors.textMuted, fontSize: 11.5, fontWeight: '600' },
  typeTextSelected: { color: colors.text, fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.cardBorder, marginTop: 4 },
  assist: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 40 },
  assistText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
  // '맞춤' 글자: 다이어리 표지 색 줄과 같은 규칙. includeFontPadding 을 끄지 않으면
  // 안드로이드에서 글꼴 여백 때문에 글자가 칸 가운데보다 위로 붙는다.
  autoText: { fontSize: 11, fontWeight: '800', textAlign: 'center', includeFontPadding: false },
})
