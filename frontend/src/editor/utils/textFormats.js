import { clamp } from './common.js'
import { textSegments } from './textRanges.js'
import { textFormatPatch, textSettings } from './text.js'

export function safeTextSelection(text, selection) {
  let start = clamp(Math.min(selection.start, selection.end), 0, text.length)
  let end = clamp(Math.max(selection.start, selection.end), 0, text.length)
  const splits = (i) => i > 0 && i < text.length && /[\uD800-\uDBFF]/.test(text[i - 1]) && /[\uDC00-\uDFFF]/.test(text[i])
  if (splits(start)) start--
  if (splits(end)) end++
  return { start, end }
}

export function normalizeTextLink(value) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  // 명시한 스킴은 http(s)만 사용한다. 도메인 입력에는 https를 붙인다.
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    return ['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password ? url.href : null
  } catch { return null }
}

function sameStyle(a, b) { return a.fontSize === b.fontSize && a.href === b.href }
export function normalizeTextFormats(text, ranges = []) {
  const result = []
  for (const range of (Array.isArray(ranges) ? ranges.filter(Boolean) : []).sort((a, b) => a.start - b.start)) {
    if (!range || !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end > text.length || range.start >= range.end) continue
    const attrs = {}
    if (Number.isFinite(range.fontSize) && range.fontSize >= 8 && range.fontSize <= 96) attrs.fontSize = range.fontSize
    if (typeof range.href === 'string' && normalizeTextLink(range.href)) attrs.href = normalizeTextLink(range.href)
    if (!Object.keys(attrs).length) continue
    const next = { start: range.start, end: range.end, ...attrs }, previous = result.at(-1)
    if (previous && next.start < previous.end) continue
    if (previous && next.start === previous.end && sameStyle(previous, next)) previous.end = next.end
    else result.push(next)
  }
  return result
}

export function formatTextRange(text, ranges, selection, makePatch) {
  const { start, end } = safeTextSelection(text, selection)
  const normalized = normalizeTextFormats(text, ranges)
  if (start === end) return normalized
  const boundaries = [...new Set([0, text.length, start, end, ...normalized.flatMap((r) => [r.start, r.end])])].sort((a, b) => a - b)
  const result = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const a = boundaries[i], b = boundaries[i + 1]
    const old = normalized.find((r) => r.start <= a && r.end >= b)
    const attrs = old ? { ...old } : {}
    delete attrs.start; delete attrs.end
    if (a >= start && b <= end) Object.assign(attrs, typeof makePatch === 'function' ? makePatch(attrs) : makePatch)
    result.push({ start: a, end: b, ...attrs })
  }
  return normalizeTextFormats(text, result)
}

export function resizeTextRange(text, ranges, selection, fontSize, delta) {
  return formatTextRange(text, ranges, selection, (style) => ({ fontSize: clamp((style.fontSize ?? fontSize) + delta, 8, 96) }))
}

export function remapTextFormats(before, after, ranges) {
  const normalized = normalizeTextFormats(before, ranges)
  if (before === after) return normalized
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++
  if (start > 0 && /[\uD800-\uDBFF]/.test(before[start - 1])) start--
  let oldEnd = before.length, newEnd = after.length
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd-- }
  const delta = newEnd - oldEnd
  const inherited = normalized.find((r) => oldEnd === start && start > 0 ? r.start < start && r.end >= start : r.start <= start && r.end > start)
  const next = normalized.flatMap((range) => {
    if (range.end <= start) return [range]
    if (range.start >= oldEnd) return [{ ...range, start: range.start + delta, end: range.end + delta }]
    return [range.start < start && { ...range, end: start }, range.end > oldEnd && { ...range, start: newEnd, end: range.end + delta }].filter(Boolean)
  })
  // URL은 새 입력에 자동 상속하지 않고 글자 크기만 상속한다.
  if (inherited?.fontSize && newEnd > start) next.push({ start, end: newEnd, fontSize: inherited.fontSize })
  return normalizeTextFormats(after, next)
}

export function richTextSegments(text, colors, formats) {
  const colorSegments = textSegments(text, colors), ranges = normalizeTextFormats(text, formats)
  let offset = 0
  const colored = colorSegments.map((s) => { const r = { ...s, start: offset, end: offset + s.text.length }; offset = r.end; return r })
  const boundaries = [...new Set([0, text.length, ...colored.flatMap((r) => [r.start, r.end]), ...ranges.flatMap((r) => [r.start, r.end])])].sort((a, b) => a - b)
  return boundaries.slice(0, -1).map((start, i) => {
    const end = boundaries[i + 1], style = ranges.find((r) => r.start <= start && r.end >= end)
    const color = colored.find((r) => r.start <= start && r.end >= end)?.color
    return { text: text.slice(start, end), ...(color && { color }), ...(style?.fontSize && { fontSize: style.fontSize }), ...(style?.href && { href: style.href }) }
  })
}

export function segmentTextStyle(segment, scale = 1) {
  return { ...(segment.color && { color: segment.color }), ...(segment.fontSize && { fontSize: segment.fontSize * scale, lineHeight: segment.fontSize * 38 / 28 * scale }), ...(segment.href && { textDecorationLine: 'underline' }) }
}

export function resizeTextObject(object, delta) {
  const settings = textSettings(object)
  const styleRanges = normalizeTextFormats(object.text, object.styleRanges).map((range) => ({ ...range, ...(range.fontSize && { fontSize: clamp(range.fontSize + delta, 8, 96) }) }))
  return { ...textFormatPatch({ ...object, styleRanges }, { ...settings, fontSize: clamp(settings.fontSize + delta, 8, 96) }), styleRanges }
}
