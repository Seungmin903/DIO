package expo.modules.diostickersplit

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.*

/** No network, models, permissions or UI-thread pixel work. Inputs are normalized local PNGs. */
class DioStickerSplitModule : Module() {
  private val cancelled = ConcurrentHashMap.newKeySet<String>()
  private fun check(id: String) { check(!cancelled.contains(id)) { "CANCELLED" } }
  private fun directory(id: String): File {
    require(id.matches(Regex("[a-zA-Z0-9-]{1,80}")))
    return File(requireNotNull(appContext.reactContext).cacheDir, "dio-sticker-split/$id").also { it.mkdirs() }
  }
  private fun local(uri: String): File {
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "LOCAL_FILE_REQUIRED" }
    return File(requireNotNull(parsed.path))
  }
  private fun bitmap(uri: String): Bitmap {
    val file = local(uri)
    val bounds = BitmapFactory.Options().also { it.inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, bounds)
    require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth.toLong() * bounds.outHeight <= 8_000_000) { "IMAGE_TOO_LARGE" }
    return requireNotNull(BitmapFactory.decodeFile(file.path)) { "DECODE_FAILED" }
  }
  private fun save(image: Bitmap, dir: File, name: String): String {
    val file = File(dir, "$name.png")
    file.outputStream().use { require(image.compress(Bitmap.CompressFormat.PNG, 100, it)) { "PNG_WRITE_FAILED" } }
    return Uri.fromFile(file).toString()
  }
  override fun definition() = ModuleDefinition {
    Name("DioStickerSplit")
    Constants("apiVersion" to 3)
    AsyncFunction("imageInfo") { uri: String ->
      TiledImage(local(uri)).use { image -> JSONObject().put("width", image.width).put("height", image.height).toString() }
    }
    Function("cancel") { id: String -> cancelled.add(id); Unit }
    AsyncFunction("cleanup") { id: String -> directory(id).deleteRecursively(); cancelled.remove(id); Unit }
    AsyncFunction("analyze") { uri: String, json: String, id: String ->
      val dir = directory(id)
      try {
        check(id)
        val options = JSONObject(json)
        TiledImage(local(uri)).use { original ->
          val crop = options.getJSONObject("crop")
          val x0 = (crop.getDouble("x") * original.width).roundToInt().coerceIn(0, original.width - 1)
          val y0 = (crop.getDouble("y") * original.height).roundToInt().coerceIn(0, original.height - 1)
          val w = (crop.getDouble("width") * original.width).roundToInt().coerceIn(1, original.width - x0)
          val h = (crop.getDouble("height") * original.height).roundToInt().coerceIn(1, original.height - y0)
          val results = JSONArray()
          val scratch = listOf("pixels.raw", "labels.raw", "queue.raw").map { File(dir, it) }
          require(dir.usableSpace > w.toLong() * h * 16 + 64 * 1024 * 1024) { "INSUFFICIENT_SCRATCH_SPACE" }
          try {
            DiskPixels(scratch[0], w * h).use { pixels -> DiskPixels(scratch[1], w * h).use { labels -> DiskPixels(scratch[2], w * h).use { queue ->
              original.read(Rect(x0, y0, x0 + w, y0 + h), pixels) { check(id) }
              val bg = if (options.optBoolean("autoBackground", false)) StickerSegmentation.estimateBackground(pixels, w, h) else {
                val bx = (options.getDouble("backgroundX") * original.width).toInt().coerceIn(0, original.width - 1)
                val by = (options.getDouble("backgroundY") * original.height).toInt().coerceIn(0, original.height - 1)
                original.sample(bx, by)
              }
              val tolerance = options.getDouble("tolerance").coerceIn(0.0, 150.0)
              var outputPixels = 0L
              StickerSegmentation.segmentStored(pixels, labels, queue, w, h, bg, tolerance, { check(id) }) { label, left, top, pw, ph, output, area ->
                outputPixels += pw.toLong() * ph
                require(outputPixels <= 32_000_000) { "OUTPUT_TOO_LARGE" }
                val part = Bitmap.createBitmap(output, pw, ph, Bitmap.Config.ARGB_8888)
                val resultUri = try { save(part, dir, "part-$label") } finally { part.recycle() }
                results.put(JSONObject().put("id", "$id-$label").put("uri", resultUri).put("x", x0 + left).put("y", y0 + top).put("width", pw).put("height", ph).put("area", area))
              }
            } } }
          } finally {
            scratch.forEach { it.delete() }
          }
          check(id)
          JSONObject().put("width", original.width).put("height", original.height).put("parts", results).toString()
        }
      } catch (error: Throwable) { dir.deleteRecursively(); throw error }
    }
    AsyncFunction("merge") { json: String, id: String ->
      check(id)
      val parts = JSONArray(json)
      require(parts.length() in 2..4096)
      var left = Int.MAX_VALUE; var top = Int.MAX_VALUE; var right = 0; var bottom = 0
      for (i in 0 until parts.length()) { val p = parts.getJSONObject(i); left = min(left, p.getInt("x")); top = min(top, p.getInt("y")); right = max(right, p.getInt("x") + p.getInt("width")); bottom = max(bottom, p.getInt("y") + p.getInt("height")) }
      require((right - left).toLong() * (bottom - top) <= 8_000_000)
      val image = Bitmap.createBitmap(right - left, bottom - top, Bitmap.Config.ARGB_8888)
      try {
        val canvas = Canvas(image)
        for (i in 0 until parts.length()) {
          check(id); val p = parts.getJSONObject(i); val source = local(p.getString("uri"))
          require(source.canonicalPath.startsWith(File(requireNotNull(appContext.reactContext).cacheDir, "dio-sticker-split").canonicalPath + File.separator))
          val piece = bitmap(p.getString("uri"))
          try { canvas.drawBitmap(piece, (p.getInt("x") - left).toFloat(), (p.getInt("y") - top).toFloat(), Paint()) } finally { piece.recycle() }
        }
        JSONObject().put("id", id).put("uri", save(image, directory(id), "merged")).put("x", left).put("y", top).put("width", image.width).put("height", image.height).put("area", (0 until parts.length()).sumOf { parts.getJSONObject(it).optInt("area", 0) }).toString()
      } finally { image.recycle() }
    }
  }
}
