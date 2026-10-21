export const TEXT_FONT_SIZE = 28
export const TEXT_LINE_HEIGHT = 38

// 입력 중에는 호출하지 않는다. IME 조합이 끝나고 완료한 문자열만 저장한다.
export function textPatch(text, width = 320, settings = {}) {
  const value = text.replace(/\r\n?/g, '\n')
  const size = settings.fontSize ?? TEXT_FONT_SIZE
  const lineHeight = size * TEXT_LINE_HEIGHT / TEXT_FONT_SIZE
  const columns = Math.max(1, Math.floor(width / size))
  const lines = value.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(Array.from(line).length / columns)), 0)
  return { text: value, h: Math.max(lineHeight, lines * lineHeight), baseWidth: width }
}

export function createText({ id, x, y, text, width = 320, ...settings }) {
  const largest = Math.max(settings.fontSize ?? TEXT_FONT_SIZE, ...(settings.styleRanges ?? []).map((range) => range.fontSize ?? 0))
  return { id, type: 'text', name: '텍스트', x, y, w: width, rotation: 0, color: '#0B1957', ...settings, ...textPatch(text, width, { ...settings, fontSize: largest }) }
}

export const TEXT_FONTS = [
  { id: 'sans', label: '기본 고딕' }, { id: 'serif', label: '기본 명조' }, { id: 'mono', label: '고정폭' },
]
export const TEXT_COLORS = ['#1D1D1F', '#8D96A8', '#DD887A', '#E1B4CA', '#A3C5F0', '#96B49F']
export const DEFAULT_TEXT_SETTINGS = { font: 'sans', fontSize: 18, color: '#1D1D1F', bold: false, italic: false, underline: false, textAlign: 'left' }

export function textSettings(object) {
  return { ...DEFAULT_TEXT_SETTINGS, ...Object.fromEntries(Object.keys(DEFAULT_TEXT_SETTINGS).filter((key) => object?.[key] != null).map((key) => [key, object[key]])), fontSize: object?.fontSize ?? (object?.type === 'text' ? TEXT_FONT_SIZE : 18) }
}

export function textStyle(object, scale = 1, platform = 'android') {
  const s = textSettings(object)
  const families = platform === 'ios' ? { sans: 'System', serif: 'Times New Roman', mono: 'Courier' } : { sans: 'sans-serif', serif: 'serif', mono: 'monospace' }
  return { fontFamily: families[s.font] ?? families.sans, fontSize: s.fontSize * scale, lineHeight: s.fontSize * TEXT_LINE_HEIGHT / TEXT_FONT_SIZE * scale, color: s.color, fontWeight: s.bold ? '700' : '400', fontStyle: s.italic ? 'italic' : 'normal', textDecorationLine: s.underline ? 'underline' : 'none', textAlign: s.textAlign, includeFontPadding: false }
}

export function textFormatPatch(object, settings) {
  const baseWidth = object.baseWidth ?? object.w
  const largest = Math.max(settings.fontSize ?? TEXT_FONT_SIZE, ...(object.styleRanges ?? []).map((range) => range.fontSize ?? 0))
  const patch = textPatch(object.text, baseWidth, { ...settings, fontSize: largest })
  return { ...settings, text: patch.text, h: patch.h * object.w / baseWidth }
}
