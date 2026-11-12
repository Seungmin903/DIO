import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import FadeScroll from './controls/FadeScroll'
import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../shared/theme'
import Svg, { Path } from 'react-native-svg'
import { TEXT_COLORS, textStyleSupport, textStyleReady, textFontChangePatch, italicTransform } from '../utils/text'
import { useTextFont } from '../hooks/useTextFont'
import EditablePalette from './controls/EditablePalette'
import NumberStepper from './controls/NumberStepper'
import PenSafeTextInput from './controls/PenSafeTextInput'
import { numberFieldStyles } from './controls/numberFieldStyles'
import TextFontDropdown from './controls/TextFontDropdown'


const STYLE_TOGGLES = [
  { id: 'bold', label: 'B', a11y: '굵게', textStyle: { fontWeight: '800' } },
  // 기울임 표시는 본문 기울임과 같이 글자 상자를 기울인다. 글꼴 기울임체(fontStyle)는 기운 끝이 글자 칸 밖으로 나가 잘렸다
  { id: 'italic', label: 'I', a11y: '기울임', textStyle: { transform: italicTransform() } },
  // 밑줄 · 취소선 표시는 글자 장식 대신 선을 직접 긋는다(안드로이드는 장식이 안 그려지거나 다시 그릴 때 사라졌다)
  { id: 'underline', label: 'U', a11y: '밑줄', icon: <LinedGlyph letter="U" line="under" /> },
  { id: 'strike', label: 'S', a11y: '취소선', icon: <LinedGlyph letter="S" line="through" /> },
]

/** 글자 하나 + 직접 그은 선(밑줄 · 취소선). 켜고 꺼도 모양이 그대로다 */
function LinedGlyph({ letter, line }) {
  return <View style={styles.glyph}>
    <Text style={toolPanelStyles.segmentText}>{letter}</Text>
    <View style={[styles.glyphLine, line === 'under' ? { bottom: 1 } : { top: '50%', marginTop: -0.5 }]} />
  </View>
}
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


/** 텍스트 서식(상자를 고른 뒤 선택 바의 `서식`). 스티커·마테·사진 옵션과 같은 모양(구역 제목·세그먼트 버튼·막대·색 줄)으로 만든다.
 * 항목 순서는 키보드 위 서식 줄(TextFormatStrip)과 같다 — 글꼴 · 크기 → 스타일 → 색 → 자간 · 줄간격 — 그 뒤에 줄에는 없는 정렬 · 세로 정렬(2026-11-10, 같은 기능으로 보이게).
 * 설명 문구는 굵게 미지원 하나만 둔다(B 가 흐려지는 이유). 글꼴 준비 중 · 불러오기 실패 · 정렬이 보이는 조건 같은 안내는 넣지 않는다(사용자 피드백 2026-11-10) */
// onOpenColorPicker: 팔레트 끝 점선 + 칸(직접 지정)을 누르면 편집기 위층의 색 창(PresetColorEditor)을 연다 — 펜 · 형광펜과 같다(지라 824)
export default function TextSettings({ settings, onChange, onClose, verticalAlignment = false, sheet = false, dragHandlers, onOpenColorPicker }) {

  // 글꼴 상태 구독: 글꼴이 늦게 와도 다시 그린다(미리보기 · 굵게 가능 여부). 준비 중 · 실패 문구는 두지 않는다(사용자 피드백 2026-11-10 — 창을 가볍게)
  useTextFont(settings.font)
  const support = textStyleSupport(settings.font, Platform.OS)
  const styleItems = STYLE_TOGGLES.map(item => ({ ...item, disabled: item.id === 'bold' && (!support.bold || !textStyleReady(settings.font, 'bold')) }))
  const [size, setSize] = useState(String(settings.fontSize))
  useEffect(() => setSize(String(settings.fontSize)), [settings.fontSize])
  const commitSize = (raw = size) => {
    const value = Number(raw)
    if (Number.isFinite(value) && value >= 8 && value <= 96) onChange({ fontSize: value })
    else setSize(String(settings.fontSize))
  }
  return <View style={sheet ? [toolPanelStyles.card, toolPanelStyles.sheetCard] : toolPanelStyles.card}>
    <ToolPanelHeader icon="text" title="텍스트" closeLabel="텍스트 설정 닫기" onClose={onClose} dragHandlers={dragHandlers} />
    <FadeScroll style={toolPanelStyles.scrollFrame} nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={toolPanelStyles.content}>
      {/* 글꼴 · 크기 한 줄(드롭다운이 글꼴 이름을 보여 주므로 제목 줄은 두지 않는다 — 옵션 창 스크롤 없애기, 코덱스 2026-11-02) */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <TextFontDropdown value={settings.font} onChange={(id) => onChange(textFontChangePatch(settings, id, Platform.OS))} />
        </View>
        <View style={[numberFieldStyles.box, styles.size]}>
          {/* 자간 · 줄간격 숫자 칸과 같이 PenSafeTextInput: S Pen 이 칸 가까이 지나가기만 해도 입력창이 열리지 않게 한다.
              자릿수는 막지 않는다(붙여넣은 100 이 10 으로 잘려 적용되지 않게) — 범위 밖 값은 commitSize 가 되돌린다 */}
          <PenSafeTextInput accessibilityLabel="글자 크기" keyboardType="numeric" value={size} onChangeText={(raw) => { setSize(raw); const value = Number(raw); if (raw.trim() && Number.isFinite(value) && value >= 8 && value <= 96) onChange({ fontSize: value }) }} onEndEditing={(event) => commitSize(event.nativeEvent.text)} onSubmitEditing={(event) => commitSize(event.nativeEvent.text)} selectTextOnFocus style={numberFieldStyles.input} />
        </View>
      </View>


      <View style={styles.inlineRow}><Text style={styles.inlineLabel}>스타일</Text><View style={styles.fill}><Segmented steadyLabel items={styleItems} selected={(id) => Boolean(settings[id] && (support[id] !== false))} onPress={(id) => { if (!styleItems.find(item => item.id === id)?.disabled) onChange({ [id]: !settings[id] }) }} /></View></View>
      {!support.bold && <Text style={styles.styleNotice}>이 글꼴은 굵게를 지원하지 않아요.</Text>}

      <EditablePalette allowDirect scope="text" label="글자" value={settings.color} onPick={color => onChange({color})} onOpenEditor={onOpenColorPicker} />

      {/* 자간 · 줄간격: 접지 않고 숫자와 좌우 −·+ 로만 바꾼다 (글자 크기 대비 백분율 값, 단위 표시는 뺀다 — % 를 붙여 봤더니 칸 배열이 어긋나고 보기 싫었다, 2026-11-10) */}
      <View style={styles.spacingRow}>
        <View style={styles.spacingColumn}>
          <Text style={toolPanelStyles.label}>자간</Text>
          <NumberStepper value={settings.letterSpacing} min={-0.1} max={0.5} step={0.01} scale={100} label="자간" minusLabel="자간 좁게" plusLabel="자간 넓게" onChange={(value) => onChange({ letterSpacing: Math.round(value * 100) / 100 })} />
        </View>
        <View style={styles.spacingColumn}>
          <Text style={toolPanelStyles.label}>줄간격</Text>
          <NumberStepper value={settings.lineSpacing} min={1} max={2.5} step={0.05} scale={100} label="줄간격" minusLabel="줄간격 좁게" plusLabel="줄간격 넓게" onChange={(value) => onChange({ lineSpacing: Math.round(value * 100) / 100 })} />
        </View>
      </View>

      <View style={styles.inlineRow}><Text style={styles.inlineLabel}>정렬</Text><View style={styles.fill}>
      <Segmented
        items={ALIGNS.map(([id, label]) => ({ id, a11y: label, icon: <Svg width={20} height={20} viewBox="0 0 24 24"><Path d={ALIGN_PATHS[id]} stroke={settings.textAlign === id ? colors.text : colors.textMuted} strokeWidth={1.8} strokeLinecap="round" /></Svg> }))}
        selected={(id) => settings.textAlign === id}
        onPress={(id) => onChange({ textAlign: id })}
      />
      </View></View>

      {verticalAlignment && <>
        <View style={styles.inlineRow}><Text style={styles.inlineLabel}>세로 정렬</Text><View style={styles.fill}><Segmented items={VERTICAL_ALIGNS.map(([id,label])=>({id,a11y:label,icon:<Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M4 3h16M4 21h16" stroke={settings.verticalAlign===id?colors.text:colors.textMuted} strokeWidth={1.8} strokeOpacity={0.35} strokeLinecap="round" /><Path d={VERTICAL_ALIGN_PATHS[id]} stroke={settings.verticalAlign===id?colors.text:colors.textMuted} strokeWidth={1.8} strokeLinecap="round" /></Svg>}))} selected={id=>settings.verticalAlign===id} onPress={id=>onChange({verticalAlign:id})} /></View></View>
      </>}
    </FadeScroll>
  </View>
}

const styles = StyleSheet.create({
  glyph: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  glyphLine: { position: 'absolute', left: 0, right: 0, height: 1.2, backgroundColor: colors.textMuted },
  styleNotice: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // 자간 · 줄간격 2단: 칸마다 이름 아래에 − 숫자 +
  spacingRow: { flexDirection: 'row', gap: 12 },
  // 제목을 왼쪽에 붙인 한 줄(스타일 · 정렬 · 세로 정렬): 펜 옵션의 막대 제목 칸과 같은 폭 52
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inlineLabel: { width: 52, color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  fill: { flex: 1 },
  spacingColumn: { flex: 1, minWidth: 0, gap: 6 },
  // 글자 크기 칸: 자간 · 줄간격의 숫자 칸과 같은 모양(numberFieldStyles — 글자 14/700 · 가운데 · border 테두리 · 모서리 9), 폭만 52
  size: { width: 52 },
  // 한 줄에 같은 간격으로 (양 끝 여백도 같게)
  colors: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.cardBorder },
  chosen: { borderWidth: 3, borderColor: colors.primaryStrong },
})
