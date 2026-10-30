// Validate the actual sfnt bytes before exposing a completed personal font.
export function inspectTrueType(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 100 || bytes.length > 64 * 1024 * 1024) throw new Error('폰트 파일 크기가 올바르지 않아요.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = p => view.getUint16(p), u32 = p => view.getUint32(p)
  if (u32(0) !== 0x10000) throw new Error('TrueType 폰트 파일이 아니에요.')
  const tables = {}, count = u16(4)
  if (count > 100 || 12 + count * 16 > bytes.length) throw new Error('폰트 테이블을 읽을 수 없어요.')
  for (let i = 0; i < count; i++) {
    const p = 12 + i * 16, name = String.fromCharCode(...bytes.subarray(p, p + 4)), offset = u32(p + 8), length = u32(p + 12)
    if (offset < 12 + count * 16 || offset + length > bytes.length || tables[name]) throw new Error('폰트 테이블 범위가 잘못됐어요.')
    tables[name] = { offset, length }
  }
  for (const name of ['head', 'maxp', 'cmap', 'glyf', 'loca', 'hhea', 'hmtx', 'name', 'post', 'OS/2']) if (!tables[name]) throw new Error('필수 폰트 테이블이 없어요.')
  if (tables.head.length < 54 || tables.maxp.length < 32 || u32(tables.head.offset + 12) !== 0x5f0f3cf5) throw new Error('폰트 헤더가 잘못됐어요.')
  const glyphs = u16(tables.maxp.offset + 4), cmap = tables.cmap.offset
  let subtable = null
  for (let i = 0; i < u16(cmap + 2); i++) {
    const p = cmap + 4 + i * 8
    if (p + 8 > cmap + tables.cmap.length) throw new Error('문자 매핑이 잘못됐어요.')
    const offset = cmap + u32(p + 4)
    if (offset + 4 > cmap + tables.cmap.length) throw new Error('문자 매핑 범위가 잘못됐어요.')
    if (u16(offset) === 4 && u16(p) === 3 && u16(p + 2) === 1) subtable = offset
  }
  if (subtable == null) throw new Error('한글 문자 매핑을 찾지 못했어요.')
  const end = subtable + u16(subtable + 2), segments = u16(subtable + 6) / 2
  if (!Number.isInteger(segments) || end > cmap + tables.cmap.length || subtable + 16 + segments * 8 > end) throw new Error('문자 매핑이 손상됐어요.')
  const ends = subtable + 14, starts = ends + segments * 2 + 2, deltas = starts + segments * 2, ranges = deltas + segments * 2
  const mapping = code => {
    for (let i = 0; i < segments; i++) if (code <= u16(ends + i * 2)) {
      if (code < u16(starts + i * 2)) return 0
      const delta = view.getInt16(deltas + i * 2), range = u16(ranges + i * 2)
      if (!range) return (code + delta) & 65535
      const at = ranges + i * 2 + range + (code - u16(starts + i * 2)) * 2
      if (at + 2 > end) throw new Error('문자 매핑이 손상됐어요.')
      const glyph = u16(at)
      return glyph ? (glyph + delta) & 65535 : 0
    }
    return 0
  }
  const long = view.getInt16(tables.head.offset + 50) === 1, entry = long ? 4 : 2
  if (![0, 1].includes(view.getInt16(tables.head.offset + 50))) throw new Error('윤곽선 위치 형식이 잘못됐어요.')
  if (tables.loca.length < (glyphs + 1) * entry) throw new Error('윤곽선 위치 정보가 부족해요.')
  const location = id => long ? u32(tables.loca.offset + id * 4) : u16(tables.loca.offset + id * 2) * 2
  for (let code = 0xac00; code <= 0xd7a3; code++) {
    const gid = mapping(code)
    if (!gid || gid >= glyphs || location(gid + 1) - location(gid) < 10 || location(gid + 1) > tables.glyf.length || view.getInt16(tables.glyf.offset + location(gid)) === 0) throw new Error('11,172자 전체를 포함한 폰트가 아니에요.')
  }
  let checksum = 0
  for (let p = 0; p < bytes.length; p += 4) {
    let word = 0
    for (let b = 0; b < 4; b++) word = (word * 256 + (bytes[p + b] ?? 0)) >>> 0
    checksum = (checksum + word) >>> 0
  }
  if (checksum !== 0xb1b0afba) throw new Error('폰트 파일 검증에 실패했어요. 원래 파일을 다시 가져와 주세요.')
  return { syllables: 11172, glyphs, bytes: bytes.length, unitsPerEm: u16(tables.head.offset + 18) }
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export function decodeUtf8(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const chunks = []; let chunk = ''
  for (let i = 0; i < bytes.length;) {
    const first = bytes[i++]; let code, rest
    if (first < 128) { code = first; rest = 0 }
    else if (first >= 194 && first <= 223) { code = first & 31; rest = 1 }
    else if (first >= 224 && first <= 239) { code = first & 15; rest = 2 }
    else if (first >= 240 && first <= 244) { code = first & 7; rest = 3 }
    else throw new Error('파일의 문자 인코딩이 잘못됐어요.')
    const length = rest
    while (rest--) { const next = bytes[i++]; if (next == null || (next & 192) !== 128) throw new Error('파일의 문자 인코딩이 잘못됐어요.'); code = (code << 6) | (next & 63) }
    if ((length === 1 && code < 128) || (length === 2 && code < 2048) || (length === 3 && code < 65536) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) throw new Error('파일의 문자 인코딩이 잘못됐어요.')
    chunk += String.fromCodePoint(code)
    if (chunk.length > 8192) { chunks.push(chunk); chunk = '' }
  }
  chunks.push(chunk); return chunks.join('')
}
export function toBase64(bytes) {
  const chunks = []
  for (let start = 0; start < bytes.length; start += 12288) {
    let s = ''
    for (let i = start; i < Math.min(start + 12288, bytes.length); i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
      s += alphabet[n >>> 18] + alphabet[(n >>> 12) & 63] + (i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : '=') + (i + 2 < bytes.length ? alphabet[n & 63] : '=')
    }
    chunks.push(s)
  }
  return chunks.join('')
}
export function fromBase64(text) {
  if (typeof text !== 'string' || text.length > 90 * 1024 * 1024 || text.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('폰트 파일 인코딩이 잘못됐어요.')
  const size = text.length / 4 * 3 - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0), bytes = new Uint8Array(size)
  let pos = 0
  for (let i = 0; i < text.length; i += 4) {
    const n = (alphabet.indexOf(text[i]) << 18) | (alphabet.indexOf(text[i + 1]) << 12) | (Math.max(0, alphabet.indexOf(text[i + 2])) << 6) | Math.max(0, alphabet.indexOf(text[i + 3]))
    if (pos < size) bytes[pos++] = (n >>> 16) & 255
    if (pos < size) bytes[pos++] = (n >>> 8) & 255
    if (pos < size) bytes[pos++] = n & 255
  }
  return bytes
}
