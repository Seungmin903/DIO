export const AI_FONT_INPUT_NOTICE = '입력한 손글씨를 바탕으로 AI가 나머지 글자를 생성합니다.'
export const AI_FONT_LABEL = 'AI 생성 손글씨 폰트'
export const AI_FONT_EXPORT_NOTICE = '이 파일에는 입력한 손글씨를 바탕으로 AI가 생성한 손글씨 폰트가 포함되어 있습니다.'

// Imported external fonts are not necessarily AI generated. DIO's validated
// format or a native generation job identifies our generated fonts, including
// older records that do not have a dedicated AI metadata field.
export const isAiHandwritingFont = font => Boolean(font && (font.sourceJob || font.spacingSupported === true))
