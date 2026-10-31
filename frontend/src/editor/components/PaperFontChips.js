import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../shared/theme'
import { PAPER_FONTS } from '../templates/paperFont.js'
import { textStyle } from '../utils/text'

// 속지 글꼴 칩. 칩 글자도 그 글꼴로 쓴다(표지 글씨체 칩과 같은 방식). 손글씨는 같은 크기에서 글자가 작아 키운다.
const FONT_SCALE = { 'nanum-pen': 1.35, 'poor-story': 1.1 }

/** [{ id, label, a11y, textStyle }] — FormControls 의 ChipGroup 이 그대로 받는다. */
export const paperFontChips = () => PAPER_FONTS.map(({ id, label }) => ({
  id, label, a11y: `속지 글꼴 ${label}`,
  textStyle: (({ fontFamily, fontWeight, fontSize }) => ({ fontFamily, fontWeight, fontSize }))(textStyle({ font: id, fontSize: 12.5 * (FONT_SCALE[id] ?? 1), color: colors.text }, 1, Platform.OS)),
}))

/** 편집기 속지 설정 창의 글꼴 고르기: 좁은 창에서 줄이 바뀌고 글자는 늘 진하게 읽힌다. value: 고른 글꼴 ID, onChange(id) */
export function PaperFontPicker({ value, onChange }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="속지 글꼴" style={local.row}>
      {paperFontChips().map((chip) => {
        const on = chip.id === value
        return (
          <Pressable key={chip.id} accessibilityRole="radio" accessibilityLabel={chip.a11y} accessibilityState={{ selected: on, checked: on }} hitSlop={4}
            onPress={() => onChange(chip.id)} style={[local.chip, on && local.chipOn]}>
            <Text numberOfLines={1} style={[local.text, chip.textStyle]}>{chip.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const local = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 20, borderWidth: 2, borderColor: 'transparent', backgroundColor: colors.surfaceMuted },
  chipOn: { backgroundColor: colors.surface, borderColor: colors.primaryStrong },
  text: { color: colors.text },
})
