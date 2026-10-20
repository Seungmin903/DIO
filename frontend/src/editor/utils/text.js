export const TEXT_FONT_SIZE = 28
export const TEXT_LINE_HEIGHT = 38

// 입력 중에는 호출하지 않는다. IME 조합이 끝나고 완료한 문자열만 저장한다.
export function textPatch(text, width = 320) {
  const value = text.replace(/\r\n?/g, '\n')
  const columns = Math.max(1, Math.floor(width / TEXT_FONT_SIZE))
  const lines = value.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(Array.from(line).length / columns)), 0)
  return { text: value, h: Math.max(TEXT_LINE_HEIGHT, lines * TEXT_LINE_HEIGHT), baseWidth: width }
}

export function createText({ id, x, y, text, width = 320 }) {
  return { id, type: 'text', name: '텍스트', x, y, w: width, rotation: 0, color: '#0B1957', ...textPatch(text, width) }
}
