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
      // OutOfMemoryError 는 Exception 이 아니라 그대로 두면 앱이 종료된다. 비트맵 생성·그리기·저장 어디서든 OUT_OF_MEMORY 로 바꿔 JS 가 알리게 한다.
      try { withRenderer(uri) { renderer ->
        check(index in 0 until renderer.pageCount) { "INVALID_PAGE" }
        val page = renderer.openPage(index)
        try {
          val scale = longEdge.toFloat() / max(page.width, page.height)
          val width = max(1, (page.width * scale).roundToInt())
          val height = max(1, (page.height * scale).roundToInt())
          val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
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
      } } catch (error: OutOfMemoryError) { throw IllegalStateException("OUT_OF_MEMORY") }
    }

    // 쪽의 한 영역(쪽 전체 대비 0~1 비율)만 outWidth × outHeight 픽셀로 그려 JPEG 로 저장한다. 확대했을 때 보이는 곳만 원본에서 선명하게 다시 그리는 데 쓴다.
    AsyncFunction("renderRegion") { uri: String, index: Int, left: Double, top: Double, width: Double, height: Double, outWidth: Int, outHeight: Int ->
      require(outWidth in 16..4096 && outHeight in 16..4096) { "INVALID_SIZE" }
      require(left >= 0.0 && top >= 0.0 && width > 0.0 && height > 0.0 && left + width <= 1.0001 && top + height <= 1.0001) { "INVALID_REGION" }
      try { withRenderer(uri) { renderer ->
        check(index in 0 until renderer.pageCount) { "INVALID_PAGE" }
        val page = renderer.openPage(index)
        try {
          val bitmap = Bitmap.createBitmap(outWidth, outHeight, Bitmap.Config.ARGB_8888)
          try {
            Canvas(bitmap).drawColor(Color.WHITE)
            // 영역 너비(pt)가 비트맵 너비에 오도록 확대한 뒤 영역의 왼쪽 위가 비트맵 원점에 오도록 옮긴다.
            val scaleX = outWidth / (width * page.width).toFloat()
            val scaleY = outHeight / (height * page.height).toFloat()
            val matrix = Matrix().apply {
              setScale(scaleX, scaleY)
              postTranslate((-left * page.width * scaleX).toFloat(), (-top * page.height * scaleY).toFloat())
            }
            page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            val dir = File(requireNotNull(appContext.reactContext).cacheDir, "dio-pdf-render").also { it.mkdirs() }
            val out = File(dir, "${UUID.randomUUID()}.jpg")
            FileOutputStream(out).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 95, it) }
            mapOf("uri" to Uri.fromFile(out).toString(), "width" to outWidth, "height" to outHeight)
          } finally { bitmap.recycle() }
        } finally { page.close() }
      } } catch (error: OutOfMemoryError) { throw IllegalStateException("OUT_OF_MEMORY") }
    }

    AsyncFunction("cleanup") {
      File(requireNotNull(appContext.reactContext).cacheDir, "dio-pdf-render").deleteRecursively()
      Unit
    }
  }
}
