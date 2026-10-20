// TextInput 선택 좌표와 같은 UTF-16 오프셋을 저장한다.
export function normalizeRanges(text, ranges = []) {
  const result = []
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end > text.length || range.start >= range.end || !/^#[0-9a-f]{6}$/i.test(range.color)) continue
    const next = { start: range.start, end: range.end, color: range.color.toUpperCase() }
    const previous = result.at(-1)
    if (previous && next.start < previous.end) continue
    if (previous && previous.end === next.start && previous.color === next.color) previous.end = next.end
    else result.push(next)
  }
  return result
}

export function colorTextRange(text, ranges, selection, color) {
  let start = Math.max(0, Math.min(text.length, selection.start)), end = Math.max(0, Math.min(text.length, selection.end))
  if (start > end) [start, end] = [end, start]
  if (start === end) return normalizeRanges(text, ranges)
  // 선택 경계가 이모지의 서로게이트 쌍 한가운데라면 문자 전체를 포함한다.
  const splitsPair = (i) => i > 0 && i < text.length && /[\uD800-\uDBFF]/.test(text[i - 1]) && /[\uDC00-\uDFFF]/.test(text[i])
  if (splitsPair(start)) start--
  if (splitsPair(end)) end++
  const next = normalizeRanges(text, ranges).flatMap((range) => {
    if (range.end <= start || range.start >= end) return [range]
    return [range.start < start && { ...range, end: start }, range.end > end && { ...range, start: end }].filter(Boolean)
  })
  return normalizeRanges(text, [...next, { start, end, color }])
}

export function remapTextRanges(before, after, ranges) {
  if (before === after) return normalizeRanges(after, ranges)
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++
  if (start > 0 && /[\uD800-\uDBFF]/.test(before[start - 1])) start--
  let oldEnd = before.length, newEnd = after.length
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd-- }
  const delta = newEnd - oldEnd
  const normalized = normalizeRanges(before, ranges)
  // 삽입은 바로 왼쪽 글자의 색을 따른다. 문서 맨 앞만 오른쪽 글자를 따른다.
  // 선택 문자열 교체는 교체되는 첫 글자의 색을 보존한다.
  const inherited = oldEnd === start && start > 0
    ? normalized.find((r) => r.start < start && r.end >= start)
    : normalized.find((r) => r.start <= start && r.end > start)
  const next = normalized.flatMap((range) => {
    if (range.end <= start) return [range]
    if (range.start >= oldEnd) return [{ ...range, start: range.start + delta, end: range.end + delta }]
    return [range.start < start && { ...range, end: start }, range.end > oldEnd && { ...range, start: newEnd, end: range.end + delta }].filter(Boolean)
  })
  if (inherited && newEnd > start) next.push({ start, end: newEnd, color: inherited.color })
  return normalizeRanges(after, next)
}

export function textSegments(text, ranges) {
  const segments = [], normalized = normalizeRanges(text, ranges)
  let offset = 0
  for (const range of normalized) {
    if (offset < range.start) segments.push({ text: text.slice(offset, range.start) })
    segments.push({ text: text.slice(range.start, range.end), color: range.color })
    offset = range.end
  }
  if (offset < text.length) segments.push({ text: text.slice(offset) })
  return segments
}
