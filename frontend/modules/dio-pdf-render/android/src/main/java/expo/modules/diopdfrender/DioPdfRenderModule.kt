package expo.modules.diopdfrender

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * PDF 한 쪽을 원하는 긴 변(픽셀)으로 그려 PNG 로 저장한다. PdfRenderer 는 비트맵 크기만큼 그리므로 PDF 크기(pt)보다 크게도 선명하게 그린다.
 * 흰 바탕에 그리고, 결과 파일은 앱 캐시에 둔다(가져온 뒤 미디어 보관함이 복사한다).
 */
class DioPdfRenderModule : Module() {
  private fun local(uri: String): File {
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "LOCAL_FILE_REQUIRED" }
    return File(requireNotNull(parsed.path))
  }

  private fun <T> withRenderer(uri: String, block: (PdfRenderer) -> T): T {
    val descriptor = try { ParcelFileDescriptor.open(local(uri), ParcelFileDescriptor.MODE_READ_ONLY) } catch (error: Exception) { throw IllegalStateException("FILE_NOT_FOUND") }
    try {
      val renderer = try { PdfRenderer(descriptor) } catch (error: SecurityException) { throw IllegalStateException("PASSWORD_PROTECTED") } catch (error: Exception) { throw IllegalStateException("INVALID_FILE") }
      try { return block(renderer) } finally { renderer.close() }
    } finally { descriptor.close() }
  }

  override fun definition() = ModuleDefinition {
    Name("DioPdfRender")

    AsyncFunction("pageCount") { uri: String -> withRenderer(uri) { it.pageCount } }

    AsyncFunction("renderPage") { uri: String, index: Int, longEdge: Int ->
      require(longEdge in 64..4096) { "INVALID_SIZE" }
      withRenderer(uri) { renderer ->
        check(index in 0 until renderer.pageCount) { "INVALID_PAGE" }
        val page = renderer.openPage(index)
        try {
          val scale = longEdge.toFloat() / max(page.width, page.height)
          val width = max(1, (page.width * scale).roundToInt())
          val height = max(1, (page.height * scale).roundToInt())
          // OutOfMemoryError 는 Exception 이 아니라 그대로 두면 앱이 종료된다. 오류 코드로 바꿔 JS 가 알리게 한다.
          val bitmap = try { Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888) } catch (error: OutOfMemoryError) { throw IllegalStateException("INVALID_SIZE") }
          try {
            Canvas(bitmap).drawColor(Color.WHITE)
            // 변환 행렬 없이 그리면 쪽이 원래 크기(1pt = 1px)로 그려져 큰 비트맵에서 흐려진다. 비트맵 크기에 맞게 확대해 그린다.
            val matrix = Matrix().apply { setScale(width.toFloat() / page.width, height.toFloat() / page.height) }
            page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            val dir = File(requireNotNull(appContext.reactContext).cacheDir, "dio-pdf-render").also { it.mkdirs() }
            val out = File(dir, "${UUID.randomUUID()}.png")
            FileOutputStream(out).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            mapOf("uri" to Uri.fromFile(out).toString(), "width" to width, "height" to height)
          } finally { bitmap.recycle() }
        } finally { page.close() }
      }
    }

    AsyncFunction("cleanup") {
      File(requireNotNull(appContext.reactContext).cacheDir, "dio-pdf-render").deleteRecursively()
      Unit
    }
  }
}
