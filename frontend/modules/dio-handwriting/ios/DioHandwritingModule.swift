import CoreGraphics
import ExpoModulesCore
import Foundation
import UIKit

public final class DioHandwritingModule: Module {
  private struct Job: Codable {
    let id: String
    let inputHash: String
    let modelVersion: String
    let preprocessVersion: String
    let spacingVersion: String
    var state = "paused"
    var stage = "queued"
    var completed = 0
    var total = HandwritingModel.total
    var fontUri: String?
    var family: String?
    var error: String?
  }

  private enum Active: Equatable { case job(String), preview }
  private enum Stop: Equatable { case pause, cancel }
  private let lock = NSLock()
  private let worker = DispatchQueue(label: "io.dio.handwriting", qos: .userInitiated)
  private var active: Active?
  private var stop: Stop?
  private let files = FileManager.default

  public func definition() -> ModuleDefinition {
    Name("DioHandwriting")
    Events("onProgress")
    AsyncFunction("capabilities") { () -> [String: Any] in
      let bundled = HandwritingModel.assets != nil
      return ["available": bundled, "platform": "ios", "precision": "fp32",
              "total": HandwritingModel.total, "modelVersion": HandwritingModel.version,
              "spacingVersion": HandwritingOutlineFont.spacingVersion,
              "reason": bundled ? "" : "이 iOS 빌드에 손글씨 모델이 포함되어 있지 않아요."]
    }
    AsyncFunction("isBusy") { self.synchronized { self.active != nil } }
    AsyncFunction("createJob") { (snapshot: String) -> String in try self.create(snapshot) }
    AsyncFunction("getJob") { (id: String) -> String in try self.jobJSON(id) }
    AsyncFunction("latestJob") { () -> String? in try self.latest() }
    AsyncFunction("getJobDraft") { (id: String) -> String in
      let data = try Data(contentsOf: self.folder(id).appendingPathComponent("input.json"))
      guard let body = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let draft = body["draft"], JSONSerialization.isValidJSONObject(draft) else {
        throw HandwritingFailure("원본 손글씨를 읽지 못했어요.")
      }
      return String(decoding: try JSONSerialization.data(withJSONObject: draft), as: UTF8.self)
    }
    AsyncFunction("resumeJob") { (id: String) -> String in try self.resume(id) }
    AsyncFunction("pauseJob") { (id: String) -> String in try self.requestStop(id, .pause) }
    AsyncFunction("cancelJob") { (id: String) -> String in try self.requestStop(id, .cancel) }
    AsyncFunction("preview") { (snapshot: String, text: String) -> String in try self.preview(snapshot, text) }
    OnAppEntersBackground { self.pauseActive() }
    OnAppContextDestroys { self.pauseActive() }
    OnDestroy { self.pauseActive() }
  }

  private func synchronized<T>(_ body: () throws -> T) rethrows -> T {
    lock.lock()
    defer { lock.unlock() }
    return try body()
  }

  private var root: URL {
    URL.applicationSupportDirectory.appendingPathComponent("dio-handwriting", isDirectory: true)
  }
  private var jobs: URL { root.appendingPathComponent("jobs", isDirectory: true) }

  private func folder(_ id: String) throws -> URL {
    guard UUID(uuidString: id)?.uuidString.lowercased() == id else {
      throw HandwritingFailure("잘못된 작업 ID예요.")
    }
    return jobs.appendingPathComponent(id, isDirectory: true)
  }

  private func fontURL(_ directory: URL) -> URL {
    directory.appendingPathComponent("font-\(HandwritingOutlineFont.spacingVersion).ttf")
  }

  private func read(_ directory: URL) throws -> Job {
    var job = try JSONDecoder().decode(Job.self, from: Data(contentsOf: directory.appendingPathComponent("state.json")))
    if job.state == "ready" { job.fontUri = fontURL(directory).absoluteString }
    return job
  }

  private func save(_ job: Job, in directory: URL) throws {
    try JSONEncoder().encode(job).write(to: directory.appendingPathComponent("state.json"), options: .atomic)
  }

  private func json(_ job: Job) throws -> String {
    String(decoding: try JSONEncoder().encode(job), as: UTF8.self)
  }

  private func notify(_ job: Job) {
    if let value = try? json(job) { sendEvent("onProgress", ["job": value]) }
  }

  private func create(_ snapshot: String) throws -> String {
    let input = try HandwritingInput.validated(snapshot)
    return try synchronized {
      let id = UUID().uuidString.lowercased()
      let directory = try folder(id)
      guard active == nil else { throw HandwritingFailure("이미 생성 중인 작업이 있어요.") }
      try files.createDirectory(at: directory, withIntermediateDirectories: true)
      try Data(snapshot.utf8).write(to: directory.appendingPathComponent("input.json"), options: .atomic)
      let job = Job(id: id, inputHash: input.inputHash, modelVersion: input.modelVersion,
                    preprocessVersion: input.preprocessVersion, spacingVersion: HandwritingOutlineFont.spacingVersion)
      return try start(job, input: input, in: directory)
    }
  }

  private func resume(_ id: String) throws -> String {
    let directory = try folder(id)
    let snapshot = try String(contentsOf: directory.appendingPathComponent("input.json"), encoding: .utf8)
    let input = try HandwritingInput.validated(snapshot)
    return try synchronized {
      let job = try read(directory)
      guard job.state != "ready", job.state != "cancelled", job.inputHash == input.inputHash,
            job.modelVersion == input.modelVersion, job.preprocessVersion == input.preprocessVersion,
            job.spacingVersion == HandwritingOutlineFont.spacingVersion else {
        throw HandwritingFailure("이 작업은 다시 시작할 수 없어요.")
      }
      return try start(job, input: input, in: directory)
    }
  }

  // Called under the lock. Write the job before making it visible to the worker.
  private func start(_ job: Job, input: HandwritingInput, in directory: URL) throws -> String {
    guard active == nil else { throw HandwritingFailure("이미 생성 중인 작업이 있어요.") }
    var queued = job
    queued.state = "processing"
    queued.stage = "queued"
    queued.error = nil
    try save(queued, in: directory)
    let encoded = try json(queued)
    active = .job(queued.id)
    stop = nil
    let saved = queued
    worker.async { self.run(saved, input: input, in: directory) }
    return encoded
  }

  private func jobJSON(_ id: String) throws -> String {
    try synchronized {
      let directory = try folder(id)
      var job = try read(directory)
      if job.state == "processing", active != .job(id) {
        job.state = "paused"
        job.stage = "interrupted"
        try save(job, in: directory)
      }
      return try json(job)
    }
  }

  private func latest() throws -> String? {
    guard files.fileExists(atPath: jobs.path) else { return nil }
    let entries = try files.contentsOfDirectory(at: jobs, includingPropertiesForKeys: [.creationDateKey])
    let dated = entries.compactMap { url -> (URL, Date)? in
      guard files.fileExists(atPath: url.appendingPathComponent("state.json").path),
            let date = try? url.resourceValues(forKeys: [.creationDateKey]).creationDate else { return nil }
      return (url, date)
    }
    return try dated.max(by: { $0.1 < $1.1 }).map { try jobJSON($0.0.lastPathComponent) }
  }

  private func requestStop(_ id: String, _ request: Stop) throws -> String {
    try synchronized {
      let directory = try folder(id)
      var job = try read(directory)
      if active == .job(id) {
        if stop != .cancel { stop = request }
      } else if request == .cancel {
        guard job.state != "ready" else { throw HandwritingFailure("완성된 폰트는 취소할 수 없어요.") }
        job.state = "cancelled"
        job.stage = "cancelled"
        try save(job, in: directory)
      }
      return try json(job)
    }
  }

  private func pauseActive() {
    synchronized { if active != nil && stop == nil { stop = .pause } }
  }

  private func checkStop() throws {
    if synchronized({ stop != nil }) { throw HandwritingFailure("생성을 잠시 멈췄어요.") }
  }

  private func update(_ job: Job, in directory: URL) throws {
    try synchronized { try save(job, in: directory) }
    notify(job)
  }

  private func run(_ queued: Job, input: HandwritingInput, in directory: URL) {
    var job = queued
    do {
      try checkStop()
      guard (0...HandwritingModel.total).contains(job.completed) else {
        throw HandwritingFailure("저장한 작업 진행 위치를 읽지 못했어요.")
      }
      if job.completed < HandwritingModel.total {
        job.stage = "encoding"
        try update(job, in: directory)
        let runtime = try HandwritingInference()
        try runtime.register(input, check: checkStop)
        while job.completed < HandwritingModel.total {
          let end = min(job.completed + 32, HandwritingModel.total)
          for index in job.completed..<end {
            try checkStop()
            try autoreleasepool {
              let pixels = try runtime.generate(HandwritingModel.first + index)
              let glyph = try HandwritingOutlineFont.outline(pixels)
              try glyph.write(to: directory.appendingPathComponent("\(index).gly"), options: .atomic)
            }
          }
          job.completed = end
          job.stage = "generating"
          try update(job, in: directory)
        }
      }

      try checkStop()
      job.stage = "building"
      try update(job, in: directory)
      let url = fontURL(directory)
      let family = "DIOHW-\(job.id.replacingOccurrences(of: "-", with: ""))-\(HandwritingOutlineFont.spacingVersion)"
      if !files.fileExists(atPath: url.path) {
        try HandwritingOutlineFont.build(in: directory, family: family, output: url)
      }
      guard let provider = CGDataProvider(url: url as CFURL),
            let font = CGFont(provider), font.numberOfGlyphs == HandwritingModel.total + 2 else {
        throw HandwritingFailure("iOS에서 완성된 폰트를 읽지 못했어요.")
      }
      job.state = "ready"
      job.stage = "ready"
      job.fontUri = url.absoluteString
      job.family = family
    } catch {
      job.state = "failed"
      job.stage = "failed"
      job.error = (error as? HandwritingFailure)?.message ?? "손글씨 폰트를 만들지 못했어요."
    }
    synchronized {
      if let stop {
        job.state = stop == .cancel ? "cancelled" : "paused"
        job.stage = job.state
        job.error = nil
        job.fontUri = nil
        job.family = nil
      }
      do { try save(job, in: directory) }
      catch {
        job.state = "failed"
        job.stage = "failed"
        job.error = "진행 내용을 저장하지 못했어요."
      }
      active = nil
      stop = nil
    }
    notify(job)
  }

  private func preview(_ snapshot: String, _ text: String) throws -> String {
    let input = try HandwritingInput.validated(snapshot)
    try synchronized {
      guard active == nil else { throw HandwritingFailure("전체 생성을 멈춘 뒤 미리볼 수 있어요.") }
      active = .preview
      stop = nil
    }
    defer { synchronized { active = nil; stop = nil } }
    let directory = root.appendingPathComponent("previews", isDirectory: true)
      .appendingPathComponent(input.inputHash, isDirectory: true)
    try files.createDirectory(at: directory, withIntermediateDirectories: true)
    let runtime = try HandwritingInference()
    try runtime.register(input, check: checkStop)
    var seen = Set<Unicode.Scalar>()
    let samples = text.unicodeScalars.lazy.filter { scalar in
      (0xac00...0xd7a3).contains(scalar.value) && seen.insert(scalar).inserted
    }.prefix(24)
    var result = [String: String]()
    for scalar in samples {
      try checkStop()
      try autoreleasepool {
        let pixels = try runtime.generate(Int(scalar.value))
        let url = directory.appendingPathComponent("\(scalar.value).png")
        try png(pixels).write(to: url, options: .atomic)
        result[String(scalar)] = url.absoluteString
      }
    }
    return String(decoding: try JSONEncoder().encode(result), as: UTF8.self)
  }

  private func png(_ pixels: [UInt8]) throws -> Data {
    guard let provider = CGDataProvider(data: Data(pixels) as CFData),
          let image = CGImage(width: 128, height: 128, bitsPerComponent: 8, bitsPerPixel: 8,
                              bytesPerRow: 128, space: CGColorSpaceCreateDeviceGray(),
                              bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
                              provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent),
          let data = UIImage(cgImage: image).pngData() else {
      throw HandwritingFailure("미리보기 이미지를 만들지 못했어요.")
    }
    return data
  }
}
