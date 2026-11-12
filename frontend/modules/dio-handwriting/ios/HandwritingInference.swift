import CryptoKit
import Foundation
import onnxruntime_objc

enum HandwritingModel {
  static let version = "dmfont-fp32-e5b28ca6-inference-v2"
  static let preprocess = "dio-ink-safe90-margin4-fp32-v2"
  static let first = 0xac00
  static let total = 11172
  static let pixels = 128 * 128
  static let prompts = Array("값같곬곶깎넋늪닫닭닻됩뗌략몃밟볘뺐뽈솩쐐앉않얘얾엌옳읊죡쮜춰츄퀭틔핀핥훟".unicodeScalars)

  static let assets: (encoder: URL, decoder: URL)? = {
    let parents = [Bundle.main, Bundle(for: DioHandwritingModule.self)]
    for parent in parents {
      guard let url = parent.url(forResource: "DioHandwritingModels", withExtension: "bundle"),
            let bundle = Bundle(url: url),
            let encoder = bundle.url(forResource: "encoder.fp32", withExtension: "onnx"),
            let decoder = bundle.url(forResource: "decoder.fp32", withExtension: "onnx") else { continue }
      return (encoder, decoder)
    }
    return nil
  }()

  static let verified: Result<(encoder: URL, decoder: URL), Error> = Result {
    guard let assets else { throw HandwritingFailure("앱 빌드에 손글씨 모델이 포함되어 있지 않아요.") }
    let expected = [
      (assets.encoder, "36f39745654a47a352752251429c36fc8f607256a3446d18791bb32b9bfdbab0"),
      (assets.decoder, "73ceea513ee8eba489f44a1f9658f2cd22d77fb6881cbd70a79fd307c80f1368")
    ]
    for (url, hash) in expected {
      let file = try FileHandle(forReadingFrom: url)
      defer { try? file.close() }
      var sha = SHA256()
      while let block = try file.read(upToCount: 1024 * 1024), !block.isEmpty { sha.update(data: block) }
      guard sha.finalize().map({ String(format: "%02x", $0) }).joined() == hash else {
        throw HandwritingFailure("손글씨 모델 파일 검증에 실패했어요.")
      }
    }
    return assets
  }

  static func addresses(_ code: Int) -> [Int] {
    let offset = code - first
    return [offset / 588, 19 + offset / 28 % 21, 40 + offset % 28]
  }
}

struct HandwritingInput: Decodable {
  struct Sample: Decodable {
    let character: String
    let pixels: [UInt8]
  }
  let modelVersion: String
  let preprocessVersion: String
  let inputHash: String
  let inputs: [Sample]

  static func validated(_ json: String) throws -> Self {
    let input = try JSONDecoder().decode(Self.self, from: Data(json.utf8))
    guard input.modelVersion == HandwritingModel.version,
          input.preprocessVersion == HandwritingModel.preprocess else {
      throw HandwritingFailure("모델이 업데이트됐어요. 저장된 손글씨로 새 작업을 시작해 주세요.")
    }
    guard input.inputHash.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
          input.inputs.count == HandwritingModel.prompts.count else {
      throw HandwritingFailure("손글씨 입력을 확인해 주세요.")
    }
    for (sample, prompt) in zip(input.inputs, HandwritingModel.prompts) {
      guard sample.character == String(prompt), sample.pixels.count == HandwritingModel.pixels,
            sample.pixels.lazy.filter({ $0 < 200 }).prefix(8).count == 8 else {
        throw HandwritingFailure("손글씨 입력을 확인해 주세요.")
      }
    }
    return input
  }
}

final class HandwritingInference {
  private let environment: ORTEnv
  private let options: ORTSessionOptions
  private let models: (encoder: URL, decoder: URL)
  private var decoder: ORTSession?
  private let mainSize = 256 * 16 * 16, skipSize = 128 * 32 * 32
  private var main = [Float](repeating: 0, count: 68 * 256 * 16 * 16)
  private var skip = [Float](repeating: 0, count: 68 * 128 * 32 * 32)

  init() throws {
    models = try HandwritingModel.verified.get()
    environment = try ORTEnv(loggingLevel: .warning)
    options = try ORTSessionOptions()
    try options.setIntraOpNumThreads(2)
  }

  private func tensor<T>(_ values: [T], _ type: ORTTensorElementDataType, _ shape: [NSNumber]) throws -> ORTValue {
    let buffer = values.withUnsafeBytes { NSMutableData(bytes: $0.baseAddress, length: $0.count) }
    return try ORTValue(tensorData: buffer, elementType: type, shape: shape)
  }

  private func floats(_ value: ORTValue?, _ count: Int) throws -> [Float] {
    guard let value else { throw HandwritingFailure("모델 출력이 비어 있어요.") }
    let data = try value.tensorData() as Data
    guard data.count == count * MemoryLayout<Float>.stride else { throw HandwritingFailure("모델 출력 크기가 올바르지 않아요.") }
    return data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
  }

  func register(_ input: HandwritingInput, check: () throws -> Void) throws {
    // Keep the encoder scoped to registration so it is released before the decoder is opened.
    let encoder = try ORTSession(env: environment, modelPath: models.encoder.path, sessionOptions: options)
    var counts = [Int](repeating: 0, count: 68)
    for (sample, prompt) in zip(input.inputs, HandwritingModel.prompts) {
      try check()
      try autoreleasepool {
        let image = sample.pixels.map { Float($0) / 127.5 - 1 }
        let result = try encoder.run(withInputs: ["image": tensor(image, .float, [1, 1, 128, 128])],
                                     outputNames: ["components", "skips"], runOptions: nil)
        let components = try floats(result["components"], 3 * mainSize)
        let skips = try floats(result["skips"], 3 * skipSize)
        for (role, address) in HandwritingModel.addresses(Int(prompt.value)).enumerated() {
          counts[address] += 1
          let mainOffset = address * mainSize, skipOffset = address * skipSize
          for i in 0..<mainSize { main[mainOffset + i] += components[role * mainSize + i] }
          for i in 0..<skipSize { skip[skipOffset + i] += skips[role * skipSize + i] }
        }
      }
    }
    guard counts.allSatisfy({ $0 > 0 }) else { throw HandwritingFailure("필요한 자모가 빠져 있어요.") }
    for (address, count) in counts.enumerated() {
      let mainOffset = address * mainSize, skipOffset = address * skipSize
      for i in mainOffset..<(mainOffset + mainSize) { main[i] /= Float(count) }
      for i in skipOffset..<(skipOffset + skipSize) { skip[i] /= Float(count) }
    }
  }

  func generate(_ code: Int) throws -> [UInt8] {
    let session: ORTSession
    if let decoder { session = decoder }
    else {
      session = try ORTSession(env: environment, modelPath: models.decoder.path, sessionOptions: options)
      decoder = session
    }
    let addresses = HandwritingModel.addresses(code)
    var components = [Float](), skips = [Float]()
    components.reserveCapacity(3 * mainSize); skips.reserveCapacity(3 * skipSize)
    for address in addresses {
      components.append(contentsOf: main[(address * mainSize)..<((address + 1) * mainSize)])
      skips.append(contentsOf: skip[(address * skipSize)..<((address + 1) * skipSize)])
    }
    let inputs = [
      "components": try tensor(components, .float, [1, 3, 256, 16, 16]),
      "skips": try tensor(skips, .float, [1, 3, 128, 32, 32]),
      "component_addresses": try tensor(addresses.map { Int64($0) }, .int64, [1, 3])
    ]
    let output = try session.run(withInputs: inputs, outputNames: ["glyph"], runOptions: nil)
    let values = try floats(output["glyph"], HandwritingModel.pixels)
    var ink = 0
    let pixels = try values.map { value -> UInt8 in
      guard value.isFinite else { throw HandwritingFailure("유효하지 않은 생성 결과예요.") }
      let gray = UInt8(((min(1, max(-1, value)) + 1) * 127.5).rounded(.toNearestOrEven))
      if gray < 200 { ink += 1 }
      return gray
    }
    guard ink >= 8 else { throw HandwritingFailure("생성된 글자의 획이 비어 있어요.") }
    return pixels
  }
}
