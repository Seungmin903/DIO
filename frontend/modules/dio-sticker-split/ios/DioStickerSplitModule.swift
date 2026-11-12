import ExpoModulesCore
import UIKit
import ImageIO

public class DioStickerSplitModule: Module {
  private let lock = NSLock()
  private var cancelled = Set<String>()
  private let queue = DispatchQueue(label: "dio.sticker.split", qos: .userInitiated)
  private func fail(_ code: String) -> NSError { NSError(domain: "DioStickerSplit", code: 1, userInfo: [NSLocalizedDescriptionKey: code]) }
  private func check(_ id: String) throws {
    lock.lock(); let stop = cancelled.contains(id); lock.unlock()
    if stop { throw fail("CANCELLED") }
  }
  private func directory(_ id: String) throws -> URL {
    guard !id.isEmpty, id.count <= 80, id.range(of: "^[a-zA-Z0-9-]+$", options: .regularExpression) != nil else { throw fail("INVALID_JOB") }
    let url = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("dio-sticker-split").appendingPathComponent(id)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }
  private func image(_ uri: String) throws -> CGImage {
    guard let url = URL(string: uri), url.isFileURL,
      let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let w = properties[kCGImagePropertyPixelWidth] as? Int,
      let h = properties[kCGImagePropertyPixelHeight] as? Int,
      w > 0, h > 0, w <= 8_000_000 / h else { throw fail("IMAGE_TOO_LARGE") }
    guard let result = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw fail("DECODE_FAILED") }
    return result
  }
  private let bitmapInfo = CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue
  private func save(_ pixels: [UInt32], _ w: Int, _ h: Int, _ dir: URL, _ name: String) throws -> String {
    let data = pixels.withUnsafeBytes { Data($0) } as CFData
    guard let provider = CGDataProvider(data: data), let cg = CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo(rawValue: bitmapInfo), provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent), let png = UIImage(cgImage: cg).pngData() else { throw fail("PNG_WRITE_FAILED") }
    let url = dir.appendingPathComponent("\(name).png")
    try png.write(to: url, options: .atomic)
    return url.absoluteString
  }
  private func json(_ value: Any) throws -> String { String(data: try JSONSerialization.data(withJSONObject: value), encoding: .utf8)! }
  public func definition() -> ModuleDefinition {
    Name("DioStickerSplit")
    Constants(["apiVersion": 3])
    Function("cancel") { (id: String) in
      self.lock.lock(); self.cancelled.insert(id); self.lock.unlock()
    }
    AsyncFunction("cleanup") { (id: String) in
      let url = try self.directory(id)
      try? FileManager.default.removeItem(at: url)
      self.lock.lock(); self.cancelled.remove(id); self.lock.unlock()
    }.runOnQueue(queue)
    AsyncFunction("analyze") { (uri: String, input: String, id: String) -> String in
      let dir = try self.directory(id)
      do {
        try self.check(id)
        guard let o = try JSONSerialization.jsonObject(with: Data(input.utf8)) as? [String: Any], let crop = o["crop"] as? [String: Double], let tolerance = o["tolerance"] as? Double else { throw self.fail("INVALID_OPTIONS") }
        let source = try self.image(uri), sw = source.width, sh = source.height
        let x0 = min(sw - 1, max(0, Int(((crop["x"] ?? 0) * Double(sw)).rounded())))
        let y0 = min(sh - 1, max(0, Int(((crop["y"] ?? 0) * Double(sh)).rounded())))
        let w = min(sw - x0, max(1, Int(((crop["width"] ?? 1) * Double(sw)).rounded())))
        let h = min(sh - y0, max(1, Int(((crop["height"] ?? 1) * Double(sh)).rounded())))
        var full = [UInt32](repeating: 0, count: sw * sh)
        let decoded = full.withUnsafeMutableBytes { bytes -> Bool in
          guard let context = CGContext(data: bytes.baseAddress, width: sw, height: sh, bitsPerComponent: 8, bytesPerRow: sw * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: self.bitmapInfo) else { return false }
          context.draw(source, in: CGRect(x: 0, y: 0, width: sw, height: sh)); return true
        }
        guard decoded else { throw self.fail("DECODE_FAILED") }
        var pixels = [UInt32](repeating: 0, count: w * h)
        for y in 0..<h { for x in 0..<w { pixels[y * w + x] = full[(y + y0) * sw + x + x0] } }
        let bg: UInt32
        if o["autoBackground"] as? Bool == true {
          var votes = [Int: [Int]]()
          func sample(_ x: Int, _ y: Int) {
            let p = pixels[y * w + x]
            if p >> 24 == 0 { return }
            let r = Int((p >> 16) & 255), g = Int((p >> 8) & 255), b = Int(p & 255)
            let key = ((r / 16) << 8) | ((g / 16) << 4) | (b / 16)
            var v = votes[key] ?? [0, 0, 0, 0]
            v[0] += 1; v[1] += r; v[2] += g; v[3] += b; votes[key] = v
          }
          for x in 0..<w { sample(x, 0); if h > 1 { sample(x, h - 1) } }
          if h > 2 { for y in 1..<(h - 1) { sample(0, y); if w > 1 { sample(w - 1, y) } } }
          if let v = votes.sorted(by: { $0.value[0] == $1.value[0] ? $0.key < $1.key : $0.value[0] > $1.value[0] }).first?.value {
            bg = (UInt32(255) << 24) | (UInt32(v[1] / v[0]) << 16) | (UInt32(v[2] / v[0]) << 8) | UInt32(v[3] / v[0])
          } else { bg = 0xffffffff }
        } else {
          guard let bx = o["backgroundX"] as? Double, let by = o["backgroundY"] as? Double else { throw self.fail("INVALID_OPTIONS") }
          bg = full[min(sh - 1, max(0, Int(by * Double(sh)))) * sw + min(sw - 1, max(0, Int(bx * Double(sw))))]
        }
        full.removeAll()
        var labels = [Int32](repeating: 0, count: pixels.count)
        var work = [Int](repeating: 0, count: pixels.count)
        let threshold = min(150, max(0, tolerance))
        func background(_ i: Int) -> Bool {
          let p = pixels[i]
          if p >> 24 == 0 { return true }
          let dr = Double(Int((p >> 16) & 255) - Int((bg >> 16) & 255))
          let dg = Double(Int((p >> 8) & 255) - Int((bg >> 8) & 255))
          let db = Double(Int(p & 255) - Int(bg & 255))
          return dr * dr + dg * dg + db * db <= threshold * threshold
        }
        var head = 0, tail = 0
        func seed(_ i: Int) { if labels[i] == 0 && background(i) { labels[i] = -1; work[tail] = i; tail += 1 } }
        for x in 0..<w { seed(x); seed((h - 1) * w + x) }
        for y in 0..<h { seed(y * w); seed(y * w + w - 1) }
        while head < tail {
          if head % 4096 == 0 { try self.check(id) }
          let i = work[head], x = i % w, y = i / w; head += 1
          if x > 0 { seed(i - 1) }; if x + 1 < w { seed(i + 1) }
          if y > 0 { seed(i - w) }; if y + 1 < h { seed(i + w) }
        }
        var results = [[String: Any]](), label: Int32 = 0
        for start in pixels.indices {
          if start % 4096 == 0 { try self.check(id) }
          if labels[start] != 0 || pixels[start] >> 24 == 0 { continue }
          guard label < 4096 else { throw self.fail("TOO_MANY_PARTS") }
          label += 1; head = 0; tail = 1; work[0] = start; labels[start] = label
          var left = w, top = h, right = 0, bottom = 0
          while head < tail {
            if head % 4096 == 0 { try self.check(id) }
            let i = work[head], x = i % w, y = i / w; head += 1
            left = min(left, x); right = max(right, x); top = min(top, y); bottom = max(bottom, y)
            for dy in -1...1 { for dx in -1...1 {
              let nx = x + dx, ny = y + dy
              if nx < 0 || ny < 0 || nx >= w || ny >= h { continue }
              let n = ny * w + nx
              if labels[n] == 0 && pixels[n] >> 24 > 0 { labels[n] = label; work[tail] = n; tail += 1 }
            } }
          }
          let pw = right - left + 1, ph = bottom - top + 1
          var output = [UInt32](repeating: 0, count: pw * ph)
          for j in 0..<tail { let i = work[j]; output[(i / w - top) * pw + i % w - left] = pixels[i] }
          let outputURI = try self.save(output, pw, ph, dir, "part-\(label)")
          results.append(["id": "\(id)-\(label)", "uri": outputURI, "x": x0 + left, "y": y0 + top, "width": pw, "height": ph, "area": tail])
        }
        try self.check(id)
        return try self.json(["width": sw, "height": sh, "parts": results])
      } catch { try? FileManager.default.removeItem(at: dir); throw error }
    }.runOnQueue(queue)
    AsyncFunction("merge") { (input: String, id: String) -> String in
      try self.check(id)
      guard let parts = try JSONSerialization.jsonObject(with: Data(input.utf8)) as? [[String: Any]], parts.count >= 2, parts.count <= 4096 else { throw self.fail("INVALID_PARTS") }
      let left = parts.map { $0["x"] as! Int }.min()!, top = parts.map { $0["y"] as! Int }.min()!
      let right = parts.map { ($0["x"] as! Int) + ($0["width"] as! Int) }.max()!, bottom = parts.map { ($0["y"] as! Int) + ($0["height"] as! Int) }.max()!
      let w = right - left, h = bottom - top
      guard w > 0, h > 0, w <= 8_000_000 / h else { throw self.fail("IMAGE_TOO_LARGE") }
      var output = [UInt32](repeating: 0, count: w * h)
      try output.withUnsafeMutableBytes { bytes in
        guard let context = CGContext(data: bytes.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: self.bitmapInfo) else { throw self.fail("DECODE_FAILED") }
        let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("dio-sticker-split").path + "/"
        for p in parts {
          try self.check(id)
          let uri = p["uri"] as! String
          guard let url = URL(string: uri), url.standardizedFileURL.path.hasPrefix(root) else { throw self.fail("INVALID_PART") }
          let image = try self.image(uri)
          context.draw(image, in: CGRect(x: (p["x"] as! Int) - left, y: h - ((p["y"] as! Int) - top) - image.height, width: image.width, height: image.height))
        }
      }
      let uri = try self.save(output, w, h, self.directory(id), "merged")
      return try self.json(["id": id, "uri": uri, "x": left, "y": top, "width": w, "height": h, "area": parts.reduce(0) { $0 + ($1["area"] as? Int ?? 0) }])
    }.runOnQueue(queue)
  }
}
