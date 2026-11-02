import ExpoModulesCore
import PDFKit
import UIKit

/// PDF 한 쪽을 원하는 긴 변(픽셀)으로 그려 PNG 로 저장한다. 흰 바탕, 결과는 앱 캐시에 둔다.
public class DioPdfRenderModule: Module {
  private func fail(_ code: String) -> NSError { NSError(domain: "DioPdfRender", code: 1, userInfo: [NSLocalizedDescriptionKey: code]) }
  private func document(_ uri: String) throws -> PDFDocument {
    guard let url = URL(string: uri), url.isFileURL else { throw fail("LOCAL_FILE_REQUIRED") }
    guard let document = PDFDocument(url: url) else { throw fail("INVALID_FILE") }
    if document.isLocked { throw fail("PASSWORD_PROTECTED") }
    return document
  }
  private var cacheDirectory: URL { FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("dio-pdf-render") }

  public func definition() -> ModuleDefinition {
    Name("DioPdfRender")

    AsyncFunction("pageCount") { (uri: String) -> Int in try self.document(uri).pageCount }

    AsyncFunction("renderPage") { (uri: String, index: Int, longEdge: Int) -> [String: Any] in
      guard longEdge >= 64, longEdge <= 4096 else { throw self.fail("INVALID_SIZE") }
      let document = try self.document(uri)
      guard index >= 0, index < document.pageCount, let page = document.page(at: index), let pdfPage = page.pageRef else { throw self.fail("INVALID_PAGE") }
      // 쪽 회전을 반영한 크기로 긴 변을 longEdge 에 맞춘다
      let box = pdfPage.getBoxRect(.cropBox)
      let turned = pdfPage.rotationAngle % 180 != 0
      let pageWidth = turned ? box.height : box.width
      let pageHeight = turned ? box.width : box.height
      let scale = CGFloat(longEdge) / max(pageWidth, pageHeight)
      let size = CGSize(width: max(1, (pageWidth * scale).rounded()), height: max(1, (pageHeight * scale).rounded()))
      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      format.opaque = true
      let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
        UIColor.white.setFill()
        context.fill(CGRect(origin: .zero, size: size))
        let cg = context.cgContext
        cg.translateBy(x: 0, y: size.height)
        cg.scaleBy(x: 1, y: -1)
        cg.concatenate(pdfPage.getDrawingTransform(.cropBox, rect: CGRect(origin: .zero, size: size), rotate: 0, preserveAspectRatio: true))
        cg.drawPDFPage(pdfPage)
      }
      guard let data = image.pngData() else { throw self.fail("INTERNAL_ERROR") }
      try FileManager.default.createDirectory(at: self.cacheDirectory, withIntermediateDirectories: true)
      let file = self.cacheDirectory.appendingPathComponent("\(UUID().uuidString).png")
      try data.write(to: file)
      return ["uri": file.absoluteString, "width": Int(size.width), "height": Int(size.height)]
    }

    // 쪽의 한 영역(쪽 전체 대비 0~1 비율)만 outWidth × outHeight 픽셀로 그려 JPEG 로 저장한다. 확대했을 때 보이는 곳만 원본에서 선명하게 다시 그리는 데 쓴다.
    AsyncFunction("renderRegion") { (uri: String, index: Int, left: Double, top: Double, width: Double, height: Double, outWidth: Int, outHeight: Int) -> [String: Any] in
      guard outWidth >= 16, outWidth <= 4096, outHeight >= 16, outHeight <= 4096 else { throw self.fail("INVALID_SIZE") }
      guard left >= 0, top >= 0, width > 0, height > 0, left + width <= 1.0001, top + height <= 1.0001 else { throw self.fail("INVALID_REGION") }
      let document = try self.document(uri)
      guard index >= 0, index < document.pageCount, let page = document.page(at: index), let pdfPage = page.pageRef else { throw self.fail("INVALID_PAGE") }
      // 쪽 전체를 이 크기로 그렸을 때의 가상 크기. 영역은 여기서 잘라 낸다.
      let fullWidth = CGFloat(outWidth) / CGFloat(width)
      let fullHeight = CGFloat(outHeight) / CGFloat(height)
      let size = CGSize(width: outWidth, height: outHeight)
      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      format.opaque = true
      let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
        UIColor.white.setFill()
        context.fill(CGRect(origin: .zero, size: size))
        let cg = context.cgContext
        cg.translateBy(x: 0, y: size.height)
        cg.scaleBy(x: 1, y: -1)
        // 뒤집힌(위쪽이 +y) 좌표에서 영역의 왼쪽 아래가 원점에 오도록 옮긴다.
        cg.translateBy(x: -CGFloat(left) * fullWidth, y: -(1 - CGFloat(top) - CGFloat(height)) * fullHeight)
        cg.concatenate(pdfPage.getDrawingTransform(.cropBox, rect: CGRect(x: 0, y: 0, width: fullWidth, height: fullHeight), rotate: 0, preserveAspectRatio: true))
        cg.drawPDFPage(pdfPage)
      }
      guard let data = image.jpegData(compressionQuality: 0.95) else { throw self.fail("INTERNAL_ERROR") }
      try FileManager.default.createDirectory(at: self.cacheDirectory, withIntermediateDirectories: true)
      let file = self.cacheDirectory.appendingPathComponent("\(UUID().uuidString).jpg")
      try data.write(to: file)
      return ["uri": file.absoluteString, "width": outWidth, "height": outHeight]
    }

    AsyncFunction("cleanup") { () -> Void in try? FileManager.default.removeItem(at: self.cacheDirectory) }
  }
}
