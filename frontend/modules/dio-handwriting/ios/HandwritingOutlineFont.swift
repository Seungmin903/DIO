import Foundation

struct HandwritingFailure: LocalizedError {
  let message: String
  init(_ message: String) { self.message = message }
  var errorDescription: String? { message }
}

private struct FontBytes {
  var data = Data()

  mutating func shorts(_ values: Int...) {
    for value in values {
      let bits = UInt16(truncatingIfNeeded: value)
      data.append(UInt8(bits >> 8))
      data.append(UInt8(truncatingIfNeeded: bits))
    }
  }

  mutating func word(_ value: UInt32) {
    shorts(Int(value >> 16), Int(value & 0xffff))
  }

  mutating func zeros(_ count: Int) { data.append(Data(count: count)) }
}

// Same 128px ink threshold, contour winding and spacing as Android OutlineFont.
enum HandwritingOutlineFont {
  static let spacingVersion = "ink-bounds-v1"
  private static let grid = 129
  private static let bearing = 16

  private static func direction(_ a: Int, _ b: Int) -> Int {
    if b == a + 1 { return 0 }
    if b == a + grid { return 1 }
    return b == a - 1 ? 2 : 3
  }

  static func outline(_ pixels: [UInt8]) throws -> Data {
    guard pixels.count == 128 * 128 else { throw HandwritingFailure("생성 이미지 크기가 올바르지 않아요.") }
    func dark(_ x: Int, _ y: Int) -> Bool {
      x >= 0 && x < 128 && y >= 0 && y < 128 && pixels[y * 128 + x] < 200
    }
    var edges = [Int: [Int]]()
    for y in 0..<128 {
      for x in 0..<128 where dark(x, y) {
        let a = y * grid + x
        if !dark(x, y - 1) { edges[a + 1, default: []].append(a) }
        if !dark(x - 1, y) { edges[a, default: []].append(a + grid) }
        if !dark(x, y + 1) { edges[a + grid, default: []].append(a + grid + 1) }
        if !dark(x + 1, y) { edges[a + grid + 1, default: []].append(a + 1) }
      }
    }

    var contours = [[Int]]()
    let turnPriority = [1, 2, 3, 0]
    for start in edges.keys.sorted() {
      while edges[start] != nil {
        var path = [Int](), current = start, previous: Int?
        repeat {
          path.append(current)
          guard var next = edges[current], !next.isEmpty else { throw HandwritingFailure("글자 윤곽이 닫히지 않았어요.") }
          let choice: Int
          if let previous, next.count > 1 {
            let incoming = direction(previous, current)
            choice = next.indices.min {
              turnPriority[(direction(current, next[$0]) - incoming + 4) % 4] <
                turnPriority[(direction(current, next[$1]) - incoming + 4) % 4]
            } ?? 0
          } else { choice = 0 }
          let target = next.remove(at: choice)
          edges[current] = next.isEmpty ? nil : next
          previous = current
          current = target
        } while current != start
        let corners = path.indices.compactMap { index -> Int? in
          let p = path[index]
          let before = path[(index + path.count - 1) % path.count]
          let after = path[(index + 1) % path.count]
          return direction(before, p) == direction(p, after) ? nil : p
        }
        if corners.count >= 3 { contours.append(corners) }
      }
    }

    let points = contours.flatMap { $0 }
    guard !points.isEmpty, points.count <= 65535, contours.count <= 32767 else {
      throw HandwritingFailure("글자 윤곽을 만들지 못했어요.")
    }
    let xs = points.map { ($0 % grid) * 16 }, ys = points.map { 1720 - ($0 / grid) * 16 }
    var out = FontBytes(), xBytes = FontBytes(), yBytes = FontBytes(), flags = [UInt8]()
    out.shorts(contours.count, xs.min()!, ys.min()!, xs.max()!, ys.max()!)
    var endpoint = -1
    for contour in contours { endpoint += contour.count; out.shorts(endpoint) }
    out.shorts(0)
    func encode(_ delta: Int, short: UInt8, same: UInt8, flag: inout UInt8, bytes: inout FontBytes) {
      if delta == 0 { flag |= same }
      else if abs(delta) <= 255 {
        flag |= short
        if delta > 0 { flag |= same }
        bytes.data.append(UInt8(abs(delta)))
      } else { bytes.shorts(delta) }
    }
    var x = 0, y = 0
    for i in points.indices {
      var flag: UInt8 = 1
      encode(xs[i] - x, short: 2, same: 16, flag: &flag, bytes: &xBytes)
      encode(ys[i] - y, short: 4, same: 32, flag: &flag, bytes: &yBytes)
      flags.append(flag)
      x = xs[i]; y = ys[i]
    }
    var i = 0
    while i < flags.count {
      var run = 1
      while run < 256 && i + run < flags.count && flags[i + run] == flags[i] { run += 1 }
      out.data.append(flags[i] | (run > 1 ? 8 : 0))
      if run > 1 { out.data.append(UInt8(run - 1)) }
      i += run
    }
    out.data.append(xBytes.data)
    out.data.append(yBytes.data)
    if out.data.count % 2 != 0 { out.zeros(1) }
    return out.data
  }

  private static func table(_ write: (inout FontBytes) -> Void) -> Data {
    var bytes = FontBytes()
    write(&bytes)
    return bytes.data
  }

  private static func checksum(_ data: Data) -> UInt32 {
    var sum: UInt32 = 0, word: UInt32 = 0
    var remaining = 4
    for byte in data {
      word = (word << 8) | UInt32(byte)
      remaining -= 1
      if remaining == 0 { sum &+= word; remaining = 4; word = 0 }
    }
    return sum &+ (word << (remaining * 8))
  }

  static func build(in folder: URL, family: String, output: URL) throws {
    let total = 11172, count = total + 2
    var glyf = FontBytes(), loca = FontBytes(), metrics = FontBytes()
    loca.word(0); loca.word(0)
    metrics.shorts(2048, 0, 1024, 0)
    var maxPoints = 0, maxContours = 0, maxAdvance = 2048, maxExtent = 0, advances = 3072
    for index in 0..<total {
      let glyph = try Data(contentsOf: folder.appendingPathComponent("\(index).gly"))
      func short(_ offset: Int) -> Int { Int(glyph[offset]) * 256 + Int(glyph[offset + 1]) }
      guard glyph.count >= 14 else { throw HandwritingFailure("저장된 글자 윤곽을 읽지 못했어요.") }
      let contours = short(0), xmin = short(2), xmax = short(6)
      guard contours > 0, contours <= 32767, glyph.count >= 12 + contours * 2,
            xmin < xmax, xmax <= 2048 else { throw HandwritingFailure("저장된 글자 윤곽이 올바르지 않아요.") }
      let extent = xmax - xmin, advance = extent + bearing * 2
      maxPoints = max(maxPoints, short(10 + (contours - 1) * 2) + 1)
      maxContours = max(maxContours, contours)
      maxAdvance = max(maxAdvance, advance)
      maxExtent = max(maxExtent, extent + bearing)
      advances += advance
      loca.word(UInt32(glyf.data.count))
      glyf.data.append(glyph)
      metrics.shorts(advance, bearing)
    }
    loca.word(UInt32(glyf.data.count))
    let tables: [String: Data] = [
      "glyf": glyf.data, "loca": loca.data, "hmtx": metrics.data,
      "head": table { $0.word(0x10000); $0.word(0x10000); $0.word(0); $0.word(0x5f0f3cf5)
        $0.shorts(9, 2048); $0.zeros(16); $0.shorts(0, -328, 2048, 1720, 0, 8, 2, 1, 0) },
      "hhea": table { $0.word(0x10000); $0.shorts(1720, -328, 0, maxAdvance, bearing, bearing, maxExtent, 1, 0, 0)
        $0.zeros(8); $0.shorts(0, count) },
      "maxp": table { $0.word(0x10000); $0.shorts(count, maxPoints, maxContours, 0, 0, 2); $0.zeros(16) },
      "post": table { $0.word(0x30000); $0.word(0); $0.shorts(-100, 50); $0.zeros(20) },
      "OS/2": table { $0.shorts(0, Int((Double(advances) / Double(count)).rounded()), 400, 5, 0)
        $0.zeros(32); $0.word(0); $0.word(1 << 24); $0.word(0); $0.word(0)
        $0.data.append(contentsOf: "DIO ".utf8); $0.shorts(64, 32, 0xd7a3, 1720, -328, 0, 1720, 328) },
      "cmap": table { $0.shorts(0, 1, 3, 1); $0.word(12)
        $0.shorts(4, 40, 0, 6, 4, 1, 2, 32, 0xd7a3, 65535, 0, 32, 0xac00, 65535,
                  1 - 32, 2 - 0xac00, 1, 0, 0, 0) },
      "name": table { out in
        let names = [family, "Regular", family + ";1.0", "나의 손글씨", "Version 1.0", family]
          .map { Data($0.utf16.flatMap { [UInt8($0 >> 8), UInt8(truncatingIfNeeded: $0)] }) }
        out.shorts(0, names.count, 6 + names.count * 12)
        var offset = 0
        for (i, name) in names.enumerated() {
          out.shorts(3, 1, 0x409, i + 1, name.count, offset)
          offset += name.count
        }
        for name in names { out.data.append(name) }
      }
    ]
    let ordered = tables.sorted { $0.key < $1.key }
    let power = 1 << (Int.bitWidth - 1 - ordered.count.leadingZeroBitCount)
    var out = FontBytes()
    out.word(0x10000)
    out.shorts(ordered.count, power * 16, power.trailingZeroBitCount, (ordered.count - power) * 16)
    var cursor = 12 + ordered.count * 16, head = 0
    for (tag, data) in ordered {
      if tag == "head" { head = cursor }
      out.data.append(contentsOf: tag.utf8)
      out.word(checksum(data)); out.word(UInt32(cursor)); out.word(UInt32(data.count))
      cursor += (data.count + 3) & ~3
    }
    out.data.reserveCapacity(cursor)
    for (_, data) in ordered { out.data.append(data); out.zeros((4 - data.count % 4) % 4) }
    let adjustment = table { $0.word(0xb1b0afba &- checksum(out.data)) }
    out.data.replaceSubrange(head + 8..<head + 12, with: adjustment)
    try out.data.write(to: output, options: .atomic)
  }
}
