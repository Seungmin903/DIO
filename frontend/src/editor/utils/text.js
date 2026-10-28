export const TEXT_FONT_SIZE = 28
export const TEXT_LINE_HEIGHT = 38
// 줄간격 기본값 (글자 크기 대비). 예전 텍스트의 38/28 과 같다.
export const DEFAULT_LINE_SPACING = TEXT_LINE_HEIGHT / TEXT_FONT_SIZE

// 글자 폭 어림 (글자 크기 대비). 한글·한자·전각은 1, 영문 대문자 0.65, 그 밖의 영문·숫자 0.55, 공백 0.3
const glyphWidth = (char) => {
  if (char === ' ') return 0.3
  if (/[\u1100-\u11FF\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/.test(char)) return 1
  return /[A-Z]/.test(char) ? 0.65 : 0.55
}

/** 너비 안에서 줄바꿈되는 줄 수 어림. 글자마다 폭을 더해 넘치면 다음 줄로 넘긴다 */
function wrappedLines(line, width, size, letterSpacing) {
  let lines = 1
  let used = 0
  for (const char of Array.from(line)) {
    const advance = glyphWidth(char) * size + letterSpacing
    if (used > 0 && used + advance > width) {
      lines += 1
      used = 0
    }
    used += advance
  }
  return lines
}

// 입력 중에는 호출하지 않는다. IME 조합이 끝나고 완료한 문자열만 저장한다.
// 높이는 글자 폭으로 줄 수를 어림해 아래에 남는 빈칸이 없게 맞춘다. (편집을 마칠 때는 실제로 잰 높이를 쓴다)
export function textPatch(text, width = 320, settings = {}) {
  const value = text.replace(/\r\n?/g, '\n')
  const size = settings.fontSize ?? TEXT_FONT_SIZE
  const lineHeight = size * (settings.lineSpacing ?? DEFAULT_LINE_SPACING)
  const letterSpacing = settings.letterSpacing ?? 0
  const lines = value.split('\n').reduce((count, line) => count + wrappedLines(line, width, size, letterSpacing), 0)
  return { text: value, h: Math.max(lineHeight, lines * lineHeight), baseWidth: width }
}

export function createText({ id, x, y, text, width = 320, ...settings }) {
  const largest = Math.max(settings.fontSize ?? TEXT_FONT_SIZE, ...(settings.styleRanges ?? []).map((range) => range.fontSize ?? 0))
  return { id, type: 'text', name: '텍스트', x, y, w: width, rotation: 0, color: '#0B1957', ...settings, ...textPatch(text, width, { ...settings, fontSize: largest, letterSpacing: largest * (settings.letterSpacing ?? 0) }) }
}

// family 가 있는 글꼴은 앱에 넣은 한국어 글꼴(Google Fonts, OFL 라이선스로 상업 이용 가능). services/textFonts.js 가 불러온다.
// 기기 글꼴(sans·serif)은 목록에 실제 글꼴 이름을 기기별로 적는다 (Android 는 기기 글꼴 설정을 바꾸면 그 글꼴이 쓰인다)
// Android 의 Noto Sans·Serif 는 한글이 CJK 판, 영문은 고딕이 Roboto·명조가 Noto Serif 로 그려진다 (영문도 지원)
// 텍스트 상자 테두리(편집 중·선택)는 글자에서 이만큼(화면 px) 떨어진 바깥에 그린다. 글자 자리는 편집할 때와 볼 때 같다.
export const TEXT_FRAME_PAD = 6
// 글자만큼 넓어지는 새 글상자의 폭 범위 (페이지 좌표)
export const TEXT_AUTO_MIN_WIDTH = 60
export const TEXT_AUTO_MAX_WIDTH = 480

export const TEXT_FONTS = [
  { id: 'sans', label: '기본 고딕', systemNames: { ios: 'Apple SD 산돌고딕 Neo', android: 'Noto Sans', web: '맑은 고딕' } },
  { id: 'serif', label: '기본 명조', systemNames: { ios: 'AppleMyungjo', android: 'Noto Serif', web: '바탕' } },
  { id: 'nanum-gothic', label: '나눔고딕', family: 'NanumGothic', boldFamily: 'NanumGothicBold' },
  { id: 'nanum-myeongjo', label: '나눔명조', family: 'NanumMyeongjo', boldFamily: 'NanumMyeongjoBold' },
  { id: 'gowun-dodum', label: '고운돋움', family: 'GowunDodum' },
  { id: 'gowun-batang', label: '고운바탕', family: 'GowunBatang', boldFamily: 'GowunBatangBold' },
  { id: 'nanum-pen', label: '나눔손글씨 펜', family: 'NanumPenScript' },
  { id: 'poor-story', label: '푸어스토리', family: 'PoorStory' },
]
// 목록에서 뺀 글꼴. 저장된 글자는 기본 고딕으로 그리고 내보내기도 막지 않는다.
// - mono(고정폭): 한글 글리프가 없어 실제로는 고딕으로 보였다.
// - black-han-sans(검은고딕): 한글 11,172자 중 2,581자만 있어 드문 글자는 다른 글꼴로 섞여 보였다.
export const RETIRED_TEXT_FONTS = ['mono', 'black-han-sans']

/** 글꼴 목록에 보일 이름. 기기 글꼴은 그 기기의 실제 글꼴 이름(예: Noto Sans)으로 보여 준다 */
export function fontLabel(font, platform = 'android') {
  return font.systemNames?.[platform] ?? font.systemNames?.android ?? font.label
}
// 불러온 앱 글꼴. 아직 불러오지 못한 글꼴은 기본 고딕으로 그린다 (없는 글꼴 이름을 쓰면 iOS 에서 오류가 난다)
const loadedFamilies = new Set()
const failedFamilies = new Set()
const fontListeners = new Set()
export const subscribeTextFonts = (listener) => { fontListeners.add(listener); return () => fontListeners.delete(listener) }
export function markTextFontLoaded(family) {
  loadedFamilies.add(family); failedFamilies.delete(family)
  fontListeners.forEach(listener => listener())
}
export function markTextFontFailed(family) {
  failedFamilies.add(family)
  fontListeners.forEach(listener => listener())
}
export function textFontSnapshot(id) {
  const font = TEXT_FONTS.find(f => f.id === id)
  return [font?.family, font?.boldFamily].filter(Boolean).map(f => `${f}:${loadedFamilies.has(f) ? 'loaded' : failedFamilies.has(f) ? 'error' : 'loading'}`).join('|')
}
/** 글꼴 id → 지금 쓸 수 있는 fontFamily. 앱 글꼴이 아니거나 아직 불러오기 전이면 null */
export function loadedFontFamily(id, bold = false) {
  const font = TEXT_FONTS.find((font) => font.id === id)
  const family = bold && font?.boldFamily && loadedFamilies.has(font.boldFamily) ? font.boldFamily : font?.family
  return family && loadedFamilies.has(family) ? family : null
}

export function textStyleSupport(id, platform = 'android') {
  const font = TEXT_FONTS.find(f => f.id === id)
  if (font?.family) return { bold: Boolean(font.boldFamily), italic: false }
  // iOS 기본 고딕의 한글 대체 서체 Apple SD Gothic Neo에는 italic face가 없다.
  if (platform === 'ios' && id === 'sans') return { bold: true, italic: false }
  return platform === 'ios' && id === 'serif' ? { bold: false, italic: false } : { bold: true, italic: true }
}

export function textStyleReady(id, style) {
  const font = TEXT_FONTS.find(f => f.id === id)
  return !font?.family || (loadedFamilies.has(font.family) && (style !== 'bold' || !font.boldFamily || loadedFamilies.has(font.boldFamily)))
}

export function textFontChangePatch(settings, id, platform) {
  const support = textStyleSupport(id, platform)
  return { font: id, bold: Boolean(settings.bold && support.bold), italic: Boolean(settings.italic && support.italic) }
}
// 펜·형광펜·마스킹테이프처럼 한 줄 7색 (같은 톤의 라벤더를 더했다)
export const TEXT_COLORS = ['#1D1D1F', '#8D96A8', '#DD887A', '#E1B4CA', '#A3C5F0', '#96B49F', '#B4A3E0']
// letterSpacing: 자간(글자 크기 대비 비율, 0.1 = 10%), lineSpacing: 줄간격(글자 크기 대비 배수), strike: 취소선
export const DEFAULT_TEXT_SETTINGS = { font: 'sans', fontSize: 18, color: '#1D1D1F', bold: false, italic: false, underline: false, strike: false, textAlign: 'left', letterSpacing: 0, lineSpacing: DEFAULT_LINE_SPACING }

export function textSettings(object) {
  return { ...DEFAULT_TEXT_SETTINGS, ...Object.fromEntries(Object.keys(DEFAULT_TEXT_SETTINGS).filter((key) => object?.[key] != null).map((key) => [key, object[key]])), fontSize: object?.fontSize ?? (object?.type === 'text' ? TEXT_FONT_SIZE : 18) }
}

export function textStyle(object, scale = 1, platform = 'android') {
  const s = textSettings(object)
  const families = platform === 'ios' ? { sans: 'System', serif: 'AppleMyungjo', mono: 'Courier' } : { sans: 'sans-serif', serif: 'serif', mono: 'monospace' }
  const decoration = [s.underline && 'underline', s.strike && 'line-through'].filter(Boolean).join(' ') || 'none'
  const support = textStyleSupport(s.font, platform)
  const family = loadedFontFamily(s.font, s.bold && support.bold)
  // 등록한 단일 face를 직접 선택한다. 파일에 없는 weight/style을 다시 요청하지 않는다.
  // 기존 iOS 기본 고딕 문서는 영문 기울임이 표시됐을 수 있어 렌더링을 보존한다.
  const legacySystemItalic = platform === 'ios' && s.font === 'sans' && s.italic
  return { fontFamily: families[s.font] ?? family ?? families.sans, fontSize: s.fontSize * scale, lineHeight: s.fontSize * s.lineSpacing * scale, letterSpacing: s.fontSize * s.letterSpacing * scale, color: s.color, fontWeight: !family && s.bold && support.bold ? '700' : '400', fontStyle: !family && s.italic && (support.italic || legacySystemItalic) ? 'italic' : 'normal', textDecorationLine: decoration, textAlign: s.textAlign, includeFontPadding: false }
}

export function textFormatPatch(object, settings) {
  const baseWidth = object.baseWidth ?? object.w
  const largest = Math.max(settings.fontSize ?? TEXT_FONT_SIZE, ...(object.styleRanges ?? []).map((range) => range.fontSize ?? 0))
  const patch = textPatch(object.text, baseWidth, { ...settings, fontSize: largest, letterSpacing: largest * (settings.letterSpacing ?? 0) })
  return { ...settings, text: patch.text, h: patch.h * object.w / baseWidth }
}

// 높이·위치를 제외하고 줄바꿈·글자 실측 크기를 바꾸는 값으로 측정 결과를 구분한다.
export function textLayoutKey(object) {
  return JSON.stringify([object.text, object.w, object.baseWidth ?? object.w, textSettings(object), object.styleRanges ?? []])
}

// 입력창 높이는 화면 배율을 따른다. 새 상자의 임시 드래그 높이는 내용 여백으로 저장하지 않는다.
export function textInputHeight(object, zoom, measuredHeight = null) {
  const settings = textSettings(object)
  const scale = object.w / (object.baseWidth ?? object.w) * zoom
  const largest = Math.max(settings.fontSize, ...(object.styleRanges ?? []).map(range => range.fontSize ?? 0))
  const minimum = largest * settings.lineSpacing * scale
  const preserved = object.existing ? (object.h ?? 0) * zoom : 0
  return Math.max(minimum, preserved, Number.isFinite(measuredHeight) && measuredHeight > 0 ? measuredHeight : 0)
}

// 수동으로 늘린 여백은 유지하고, 이전 문서나 줄바꿈 증가로 부족한 높이만 보완한다.
export function fitTextHeightPatch(object, measuredHeight) {
  if (object?.type !== 'text' || !Number.isFinite(measuredHeight) || measuredHeight <= 0) return null
  return measuredHeight > object.h + 0.5 ? { h: Math.ceil(measuredHeight * 100) / 100 } : null
}
