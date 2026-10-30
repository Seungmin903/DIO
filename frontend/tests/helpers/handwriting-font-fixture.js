// Synthetic legacy DIO font: all Hangul, three different rectangular outlines.
// No person's handwriting or pretrained assets are needed by the unit tests.
export function sum32(bytes) {
  let sum = 0
  for (let i = 0; i < bytes.length; i += 4) sum = (sum + ((bytes[i] ?? 0) * 0x1000000 + ((bytes[i + 1] ?? 0) << 16) + ((bytes[i + 2] ?? 0) << 8) + (bytes[i + 3] ?? 0))) >>> 0
  return sum
}
export function tablesOf(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), result = {}
  for (let i = 0; i < v.getUint16(4); i++) {
    const p = 12 + i * 16, tag = String.fromCharCode(...bytes.subarray(p, p + 4))
    result[tag] = { offset: v.getUint32(p + 8), length: v.getUint32(p + 12), checksum: v.getUint32(p + 4) }
  }
  return result
}
export function repairChecksum(bytes) {
  const v = new DataView(bytes.buffer), tables = tablesOf(bytes), at = tables.head.offset
  v.setUint32(at + 8, 0)
  for (let i = 0; i < v.getUint16(4); i++) {
    const p = 12 + i * 16, offset = v.getUint32(p + 8), length = v.getUint32(p + 12)
    v.setUint32(p + 4, sum32(bytes.subarray(offset, offset + length)))
  }
  v.setUint32(at + 8, (0xb1b0afba - sum32(bytes)) >>> 0)
  return bytes
}
export function legacyFont() {
  const count = 11174, tables = {}, create = (tag, length) => {
    const b = new Uint8Array(length); tables[tag] = b; return new DataView(b.buffer)
  }
  const head = create('head', 54)
  head.setUint32(0, 0x10000); head.setUint32(12, 0x5f0f3cf5); head.setUint16(16, 11); head.setUint16(18, 2048)
  head.setInt16(38, -328); head.setInt16(40, 2048); head.setInt16(42, 1720); head.setInt16(50, 1)
  const maxp = create('maxp', 32); maxp.setUint32(0, 0x10000); maxp.setUint16(4, count); maxp.setUint16(6, 4); maxp.setUint16(8, 1); maxp.setUint16(14, 2)
  const hhea = create('hhea', 36); hhea.setUint32(0, 0x10000); hhea.setInt16(4, 1720); hhea.setInt16(6, -328); hhea.setUint16(10, 2048); hhea.setInt16(18, 1); hhea.setUint16(34, 3)
  const hmtx = create('hmtx', 12 + (count - 3) * 2)
  hmtx.setUint16(0, 2048); hmtx.setUint16(4, 1024); hmtx.setUint16(8, 2048)
  const glyf = create('glyf', (count - 2) * 34), loca = create('loca', (count + 1) * 4)
  for (let i = 2; i < count; i++) {
    const xmin = [384, 64, 192][(i - 2) % 3], width = [640, 1024, 1536][(i - 2) % 3], p = (i - 2) * 34
    loca.setUint32(i * 4, p); glyf.setInt16(p, 1); glyf.setInt16(p + 2, xmin); glyf.setInt16(p + 6, xmin + width); glyf.setInt16(p + 8, 1024)
    glyf.setUint16(p + 10, 3)
    for (let j = 0; j < 4; j++) glyf.setUint8(p + 14 + j, 1)
    ;[xmin, 0, width, 0, 0, 1024, 0, -1024].forEach((d, j) => glyf.setInt16(p + 18 + j * 2, d))
    hmtx.setInt16(i < 3 ? i * 4 + 2 : 12 + (i - 3) * 2, xmin)
  }
  loca.setUint32(count * 4, glyf.byteLength)
  const cmap = create('cmap', 52); cmap.setUint16(2, 1); cmap.setUint16(4, 3); cmap.setUint16(6, 1); cmap.setUint32(8, 12)
  cmap.setUint16(12, 4); cmap.setUint16(14, 40); cmap.setUint16(18, 6); cmap.setUint16(20, 4); cmap.setUint16(22, 1); cmap.setUint16(24, 2)
  ;[32, 0xd7a3, 65535].forEach((n, i) => cmap.setUint16(26 + i * 2, n))
  ;[32, 0xac00, 65535].forEach((n, i) => cmap.setUint16(34 + i * 2, n))
  ;[1 - 32, 2 - 0xac00, 1].forEach((n, i) => cmap.setUint16(40 + i * 2, n & 65535))
  const os2 = create('OS/2', 78); os2.setInt16(2, 2048); os2.setUint16(4, 400); 'DIO '.split('').forEach((c, i) => os2.setUint8(58 + i, c.charCodeAt(0)))
  const post = create('post', 32); post.setUint32(0, 0x30000)
  create('name', 6)
  const tags = Object.keys(tables).sort(), total = 12 + tags.length * 16 + tags.reduce((sum, tag) => sum + ((tables[tag].length + 3) & ~3), 0)
  const bytes = new Uint8Array(total), v = new DataView(bytes.buffer)
  v.setUint32(0, 0x10000); v.setUint16(4, tags.length); v.setUint16(6, 128); v.setUint16(8, 3); v.setUint16(10, 32)
  let at = 12 + tags.length * 16
  tags.forEach((tag, i) => {
    const p = 12 + i * 16
    tag.split('').forEach((c, j) => bytes[p + j] = c.charCodeAt(0))
    v.setUint32(p + 8, at); v.setUint32(p + 12, tables[tag].length); bytes.set(tables[tag], at); at += (tables[tag].length + 3) & ~3
  })
  return repairChecksum(bytes)
}
