import { Platform } from 'react-native'
import { colors } from '../../shared/theme'
import { PAPER_FONTS } from '../templates/paperFont.js'
import { textFontPreviewFamily, textFontStatus } from '../utils/text'

// 속지 글꼴 목록 글자. 목록 글자도 그 글꼴로 쓴다(표지 글씨체 칩과 같은 방식). 손글씨는 같은 크기에서 글자가 작아 키운다.
const FONT_SCALE = { 'nanum-pen': 1.35, 'poor-story': 1.1 }

/** [{ id, label, a11y, status, textStyle }] — PaperFontDropdown 이 그대로 받는다. status 는 textFontStatus(받지 않은 원격 글꼴이면 'download') */
// only: 만들 글꼴 ID 들(없으면 전부). 칩을 만드는 순간 그 글꼴 파일을 요청하므로(받지 않은 원격 글꼴은 받지 않는다), 보이지 않는 글꼴은 만들지 않는다.
export const paperFontChips = (only) => PAPER_FONTS.filter(({ id }) => !only || only.includes(id)).map(({ id, label }) => {
  const status = textFontStatus(id) // 항목마다 한 번만 계산한다
  return { id, label, a11y: `속지 글꼴 ${label}`, status,
    textStyle: { fontFamily: textFontPreviewFamily(id, Platform.OS, status), fontWeight: '400', fontSize: 12.5 * (FONT_SCALE[id] ?? 1), color: colors.text } }
})
