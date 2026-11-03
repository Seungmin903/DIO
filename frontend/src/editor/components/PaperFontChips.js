import { Platform } from 'react-native'
import { colors } from '../../shared/theme'
import { PAPER_FONTS } from '../templates/paperFont.js'
import { textStyle } from '../utils/text'

// 속지 글꼴 목록 글자. 목록 글자도 그 글꼴로 쓴다(표지 글씨체 칩과 같은 방식). 손글씨는 같은 크기에서 글자가 작아 키운다.
const FONT_SCALE = { 'nanum-pen': 1.35, 'poor-story': 1.1 }

/** [{ id, label, a11y, textStyle }] — PaperFontDropdown 이 그대로 받는다. */
export const paperFontChips = () => PAPER_FONTS.map(({ id, label }) => ({
  id, label, a11y: `속지 글꼴 ${label}`,
  textStyle: (({ fontFamily, fontWeight, fontSize }) => ({ fontFamily, fontWeight, fontSize }))(textStyle({ font: id, fontSize: 12.5 * (FONT_SCALE[id] ?? 1), color: colors.text }, 1, Platform.OS)),
}))
