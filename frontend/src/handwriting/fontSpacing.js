import { inspectTrueType } from './fontFormat.js'

export const FONT_SPACING_VERSION = 'ink-bounds-v1'
export const FONT_SIDE_BEARING = 16 // One pixel in the 128px / 2048-unit model grid.
const unsupported = () => new Error('DIO에서 만든 손글씨 폰트만 간격을 보정할 수 있어요.')
const pause = () => new Promise(resolve => setTimeout(resolve, 0))
const viewOf = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
const tagAt = (bytes, p) => String.fromCharCode(...bytes.subarray(p, p + 4))

function tablesOf(bytes) {
  const v = viewOf(bytes), tables = new Map(), count = v.getUint16(4)
  for (let i = 0; i < count; i++) {
    const p = 12 + i * 16, start = v.getUint32(p + 8), length = v.getUint32(p + 12)
    tables.set(tagAt(bytes, p), bytes.subarray(start, start + length))
  }
  return tables
}
function dioFont(bytes) {
  inspectTrueType(bytes)
  const tables = tablesOf(bytes), head = viewOf(tables.get('head')), hhea = viewOf(tables.get('hhea'))
  const os2 = tables.get('OS/2'), maxp = viewOf(tables.get('maxp'))
  if (os2.length < 78 || tagAt(os2, 58) !== 'DIO ' || head.getUint16(18) !== 2048 ||
      maxp.getUint16(4) !== 11174 || hhea.byteLength < 36 || tables.has('fvar') || tables.has('CFF ')) throw unsupported()
  const count = maxp.getUint16(4), n = hhea.getUint16(34), hmtx = viewOf(tables.get('hmtx'))
  if (!n || n > count || hmtx.byteLength < n * 4 + (count - n) * 2) throw unsupported()
  const advances = [], bearings = [], bounds = [], glyphs = tables.get('glyf'), loca = viewOf(tables.get('loca'))
  const long = head.getInt16(50) === 1
  const location = id => long ? loca.getUint32(id * 4) : loca.getUint16(id * 2) * 2
  // DIO's complete cmap maps space to GID 1 and Hangul sequentially to 2..11173.
  const cmap = viewOf(tables.get('cmap'))
  let sub = -1
  for (let i = 0; i < cmap.getUint16(2); i++) {
    const p = 4 + i * 8, at = cmap.getUint32(p + 4)
    if (cmap.getUint16(p) === 3 && cmap.getUint16(p + 2) === 1 && cmap.getUint16(at) === 4) sub = at
  }
  if (sub < 0) throw unsupported()
  const segments = cmap.getUint16(sub + 6) / 2, ends = sub + 14, starts = ends + segments * 2 + 2
  const deltas = starts + segments * 2, ranges = deltas + segments * 2
  const gid = code => {
    for (let i = 0; i < segments; i++) if (code <= cmap.getUint16(ends + i * 2)) {
      if (code < cmap.getUint16(starts + i * 2) || cmap.getUint16(ranges + i * 2)) throw unsupported()
      return (code + cmap.getInt16(deltas + i * 2)) & 65535
    }
    return 0
  }
  if (gid(32) !== 1) throw unsupported()
  for (let i = 0; i < count; i++) {
    advances.push(hmtx.getUint16(Math.min(i, n - 1) * 4))
    bearings.push(hmtx.getInt16(i < n ? i * 4 + 2 : n * 4 + (i - n) * 2))
    const start = location(i), end = location(i + 1)
    if (start > end || end > glyphs.length) throw unsupported()
    if (i < 2) { if (start !== end) throw unsupported(); bounds.push(null); continue }
    if (gid(0xac00 + i - 2) !== i || end - start < 14) throw unsupported()
    const g = viewOf(glyphs.subarray(start, end)), contours = g.getInt16(0)
    const xmin = g.getInt16(2), xmax = g.getInt16(6)
    if (contours < 1 || contours > 32767 || 12 + contours * 2 > g.byteLength || xmin < 0 || xmax > 2048 || xmax <= xmin) throw unsupported()
    bounds.push({ xmin, xmax, glyph: g })
  }
  return { tables, count, advances, bearings, bounds }
}

/** Derived from the file, never trusted from an imported JSON label/version. */
export function fontSpacingInfo(bytes) {
  try {
    const f = dioFont(bytes)
    const adjusted = !(viewOf(f.tables.get('head')).getUint16(16) & 2) && f.bounds.every((b, i) =>
      !b || (f.advances[i] === b.xmax - b.xmin + FONT_SIDE_BEARING * 2 && f.bearings[i] === FONT_SIDE_BEARING))
    return { spacingSupported: true, ...(adjusted && { spacingVersion: FONT_SPACING_VERSION }) }
  } catch { return { spacingSupported: false } }
}

// Refuse hinted/composite/foreign outlines. Check the actual coordinates, not
// just a caller-controlled bounding box, before deriving new horizontal metrics.
function validateGlyph(g) {
  const contours = g.getUint16(0)
  let endPoint = -1
  for (let i = 0; i < contours; i++) {
    const next = g.getUint16(10 + i * 2)
    if (next <= endPoint) throw unsupported()
    endPoint = next
  }
  let p = 10 + contours * 2
  if (g.getUint16(p) !== 0) throw unsupported()
  p += 2
  const flags = []
  while (flags.length <= endPoint) {
    const flag = g.getUint8(p++), run = flag & 8 ? g.getUint8(p++) + 1 : 1
    if (!(flag & 1) || (flag & 128) || flags.length + run > endPoint + 1) throw unsupported()
    for (let i = 0; i < run; i++) flags.push(flag)
  }
  for (const [shortBit, sameBit, low, high] of [[2, 16, 2, 6], [4, 32, 4, 8]]) {
    let value = 0, min = Infinity, max = -Infinity
    for (const flag of flags) {
      if (flag & shortBit) value += g.getUint8(p++) * (flag & sameBit ? 1 : -1)
      else if (!(flag & sameBit)) { value += g.getInt16(p); p += 2 }
      min = Math.min(min, value); max = Math.max(max, value)
    }
    if (min !== g.getInt16(low) || max !== g.getInt16(high)) throw unsupported()
  }
  if (p > g.byteLength || g.byteLength - p > 3) throw unsupported()
  while (p < g.byteLength) if (g.getUint8(p++) !== 0) throw unsupported()
}
function fontNames(family, displayName) {
  const names = [family, 'Regular', `${family};${FONT_SPACING_VERSION}`, displayName, 'Version 1.1', family]
  const length = names.reduce((sum, text) => sum + text.length * 2, 0), bytes = new Uint8Array(78 + length), v = viewOf(bytes)
  v.setUint16(2, 6); v.setUint16(4, 78)
  let offset = 0
  names.forEach((name, i) => {
    const p = 6 + i * 12
    ;[3, 1, 0x409, i + 1, name.length * 2, offset].forEach((value, j) => v.setUint16(p + j * 2, value))
    for (let j = 0; j < name.length; j++) v.setUint16(78 + offset + j * 2, name.charCodeAt(j))
    offset += name.length * 2
  })
  return bytes
}
async function checksum(bytes) {
  let sum = 0
  for (let p = 0; p < bytes.length; p += 4) {
    sum = (sum + (((bytes[p] ?? 0) * 0x1000000) + ((bytes[p + 1] ?? 0) << 16) + ((bytes[p + 2] ?? 0) << 8) + (bytes[p + 3] ?? 0))) >>> 0
    if (p && p % 1048576 === 0) await pause()
  }
  return sum
}

export async function correctFontSpacing(bytes, { family, displayName, onProgress = () => {} }) {
  if (!/^DIOHW-[A-Za-z0-9-]{1,50}$/.test(family) || typeof displayName !== 'string' || !displayName.trim() || displayName.length > 30) throw new Error('폰트 이름이 올바르지 않아요.')
  const f = dioFont(bytes)
  if (fontSpacingInfo(bytes).spacingVersion) throw new Error('이미 글자 간격이 보정된 폰트예요.')
  const advances = [...f.advances], bearings = [...f.bearings]
  for (let i = 2; i < f.count; i++) {
    try { validateGlyph(f.bounds[i].glyph) } catch { throw unsupported() }
    advances[i] = f.bounds[i].xmax - f.bounds[i].xmin + FONT_SIDE_BEARING * 2
    bearings[i] = FONT_SIDE_BEARING
    if (i % 256 === 0) { onProgress(i - 1); await pause() }
  }
  const tables = new Map(f.tables), hmtx = new Uint8Array(f.count * 4), metrics = viewOf(hmtx)
  advances.forEach((width, i) => { metrics.setUint16(i * 4, width); metrics.setInt16(i * 4 + 2, bearings[i]) })
  tables.set('hmtx', hmtx)
  const head = tables.get('head').slice(), hv = viewOf(head)
  hv.setUint32(8, 0); hv.setUint16(16, hv.getUint16(16) & ~2); tables.set('head', head)
  const hhea = tables.get('hhea').slice(), hh = viewOf(hhea)
  hh.setUint16(10, Math.max(...advances)); hh.setInt16(12, FONT_SIDE_BEARING); hh.setInt16(14, FONT_SIDE_BEARING)
  hh.setInt16(16, Math.max(...f.bounds.slice(2).map(b => b.xmax - b.xmin + FONT_SIDE_BEARING)))
  hh.setUint16(34, f.count); tables.set('hhea', hhea)
  const os2 = tables.get('OS/2').slice(); viewOf(os2).setInt16(2, Math.round(advances.reduce((sum, width) => sum + width, 0) / f.count)); tables.set('OS/2', os2)
  tables.set('name', fontNames(family, displayName))
  const ordered = [...tables].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  let cursor = 12 + ordered.length * 16, headOffset = 0
  const output = new Uint8Array(cursor + ordered.reduce((sum, [, data]) => sum + ((data.length + 3) & ~3), 0)), v = viewOf(output)
  v.setUint32(0, 0x10000); v.setUint16(4, ordered.length)
  const power = 2 ** Math.floor(Math.log2(ordered.length))
  v.setUint16(6, power * 16); v.setUint16(8, Math.log2(power)); v.setUint16(10, ordered.length * 16 - power * 16)
  for (let i = 0; i < ordered.length; i++) {
    const [tag, data] = ordered[i], p = 12 + i * 16
    for (let j = 0; j < 4; j++) output[p + j] = tag.charCodeAt(j)
    v.setUint32(p + 4, await checksum(data)); v.setUint32(p + 8, cursor); v.setUint32(p + 12, data.length)
    output.set(data, cursor)
    if (tag === 'head') headOffset = cursor
    cursor += (data.length + 3) & ~3
  }
  v.setUint32(headOffset + 8, (0xb1b0afba - await checksum(output)) >>> 0)
  inspectTrueType(output)
  onProgress(11172)
  return output
}
