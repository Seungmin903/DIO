import { useRef, useState, useSyncExternalStore } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { bubble, colors } from '../../../shared/theme'
import { downloadTextFont, fontLabel, getPickableTextFonts, getTextFonts, resolveFontId, subscribeTextFonts, textFontPreviewFamily, textFontStateSnapshot, textFontStatus } from '../../utils/text'
import { AI_FONT_LABEL } from '../../../handwriting/aiDisclosure.js'
import PopoverMenu from '../../../diary/components/PopoverMenu'
import FontStatusMark, { FONT_PENDING_TEXT, fontNeedsDownload, fontStatusA11y } from './FontStatusMark'

const ROW = 44, AI_ROW = 64, GROUP = 30, MAX_HEIGHT = 320

// 글꼴 이름을 그 글꼴로 보여 준다 (아직 불러오지 못한 앱 글꼴은 기본 글꼴, 받지 않은 원격 글꼴은 받지 않고 기본 글꼴)
const previewFont = (id, status) => ({ fontFamily: textFontPreviewFamily(id, Platform.OS, status) })

/**
 * 글꼴 고르기: 편집기 텍스트 설정과 새 다이어리 표지 제목이 같은 목록(내 폰트 + 기본 글꼴)을 쓴다.
 * 목록은 칸 아래(자리가 없으면 위)에 따로 뜨는 말풍선 안의 스크롤이라, 뒤 패널 스크롤과 함께 움직이지 않는다.
 * 바깥을 누르거나 뒤로 가기 · 회전이면 닫힌다(PopoverMenu). value: 글꼴 ID, onChange(id), label: 화면 읽기 이름, style: 칸 모양
 */
export default function TextFontDropdown({ value, onChange, label = '글꼴', style }) {
  // 글꼴 목록이 바뀔 때와 글꼴을 불러왔을 때 다시 그린다(미리보기 글자가 늦게 온 글꼴로 바뀌어야 한다)
  useSyncExternalStore(subscribeTextFonts, textFontStateSnapshot, textFontStateSnapshot)
  const fonts = getTextFonts()
  // 숨긴 원격 글꼴은 고르는 목록에서만 뺀다(이미 고른 글꼴이면 칸에는 그대로 보인다)
  const pickable = getPickableTextFonts()
  const personal = pickable.filter(font => font.personal)
  const groups = [...(personal.length ? [{ label: '내 폰트', fonts: personal }] : []), { label: '기본 글꼴', fonts: pickable.filter(font => !font.personal) }]
  const currentId = resolveFontId(value)
  const current = fonts.find(font => font.id === currentId) ?? fonts[0]
  const field = useRef(null)
  const [anchor, setAnchor] = useState(null)
  const [open, setOpen] = useState(false)
  const show = () => {
    const node = field.current
    if (node?.measureInWindow) node.measureInWindow((x, y, width, height) => { setAnchor({ x, y, width, height }); setOpen(true) })
    else setOpen(true)
  }
  const height = Math.min(MAX_HEIGHT, groups.reduce((sum, group) => sum + GROUP + group.fonts.reduce((height, font) => height + (font.aiGenerated ? AI_ROW : ROW), 0), 0)) + 2
  return <View style={local.wrap}>
    <View ref={field} collapsable={false}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} 선택`} accessibilityState={{ expanded: open }} hitSlop={4} onPress={() => (open ? setOpen(false) : show())} style={[local.field, style]}>
        <Text style={[local.fieldText, previewFont(current.id)]} numberOfLines={1}>{fontLabel(current, Platform.OS)}</Text>
        <Svg width={12} height={12} viewBox="0 0 24 24"><Path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} fill="none" stroke={colors.text} strokeWidth={2} /></Svg>
      </Pressable>
    </View>
    {/* 말풍선 폭은 칸 폭과 같고, 왼쪽 끝도 칸에 맞춘다(PopoverMenu 는 기준의 오른쪽 끝에 맞춘다) */}
    <PopoverMenu open={open} anchor={anchor} width={anchor?.width ?? 260} height={height} label={`${label} 목록`} style={local.menu} onClose={() => setOpen(false)}>
      {/* 항목의 미리보기 글꼴(previewFont)은 만드는 순간 그 글꼴 파일을 요청한다. 닫혀 있을 때도 만들면 이 칸이 화면에 올라오는 것만으로 모든 글꼴을 읽으므로, 열렸을 때만 만든다 */}
      {open && <ScrollView style={{ maxHeight: MAX_HEIGHT }} keyboardShouldPersistTaps="handled">
        {groups.map(group => <View key={group.label}>
          <Text accessibilityRole="header" style={local.group}>{group.label}</Text>
          {group.fonts.map(font => {
            // 받지 않은 원격 글꼴은 흐린 이름 + 받기 표시. 누르면 고르지 않고 받기만 한다(받은 뒤 다시 눌러 고른다)
            const status = textFontStatus(font.id), pending = fontNeedsDownload(status)
            return <Pressable key={font.id} accessibilityRole="button" accessibilityLabel={`${fontLabel(font, Platform.OS)}${font.aiGenerated ? ` · ${AI_FONT_LABEL}` : ''}${fontStatusA11y(status)}`} accessibilityState={{ selected: current.id === font.id, busy: status === 'downloading' }}
              onPress={() => { if (status === 'downloading') return; if (pending) { downloadTextFont(font.id); return } setOpen(false); onChange(font.id) }} style={[local.option, font.aiGenerated && { height: AI_ROW }, current.id === font.id && local.optionSelected]}>
              <View style={local.optionName}>
                <Text style={[local.optionText, previewFont(font.id, status), pending && FONT_PENDING_TEXT]} numberOfLines={1}>{fontLabel(font, Platform.OS)}</Text>
                {font.aiGenerated && <Text style={local.aiLabel}>{AI_FONT_LABEL}</Text>}
              </View>
              <FontStatusMark status={status} id={font.id} />
            </Pressable>
          })}
        </View>)}
      </ScrollView>}
    </PopoverMenu>
  </View>
}

const local = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  fieldText: { flexShrink: 1, color: colors.text, fontSize: 14 },
  menu: { ...bubble, padding: 0, overflow: 'hidden' },
  group: { height: GROUP, paddingHorizontal: 12, paddingTop: 10, color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  option: { height: ROW, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  optionName: { flex: 1, justifyContent: 'center' },
  optionSelected: { backgroundColor: colors.surfaceMuted },
  aiLabel: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  optionText: { color: colors.text, fontSize: 16 },
})
