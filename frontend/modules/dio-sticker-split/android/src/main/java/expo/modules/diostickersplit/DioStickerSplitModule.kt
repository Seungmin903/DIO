package expo.modules.diostickersplit

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.DataOutputStream
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
  private fun inkFile(part: JSONObject): File {
    val png = local(part.getString("uri"))
    val root = File(requireNotNull(appContext.reactContext).cacheDir, "dio-sticker-split").canonicalPath + File.separator
    require(png.canonicalPath.startsWith(root) && png.name.matches(Regex("part-[0-9]+\\.png"))) { "INVALID_CANDIDATE" }
    return File(png.parentFile, png.nameWithoutExtension + ".runs").also { require(it.isFile && it.length() > 0 && it.length() % 12L == 0L) { "INK_DATA_MISSING" } }
  }
  private fun <T> withRuns(part: JSONObject, work: (InkRuns) -> T): T {
    val file = inkFile(part)
    DiskPixels(file, (file.length() / 4).toInt()).use { data ->
      return work(object : InkRuns {
        override val size = data.size / 3
        override fun get(index: Int) = InkRun(data[index * 3], data[index * 3 + 1], data[index * 3 + 2])
      })
    }
  }
  override fun definition() = ModuleDefinition {
    Name("DioStickerSplit")
    Constants("apiVersion" to 3, "selectionEditingVersion" to 1, "completeRegionVersion" to 1)
    AsyncFunction("inspectInput") { uri: String -> StickerInput.inspect(local(uri)) }
    AsyncFunction("prepareImage") { uri: String, id: String ->
      val dir = directory(id)
      try {
        check(id); val file = local(uri); StickerInput.inspect(file)
        TiledImage(file).use { original ->
          val bounds = BitmapFactory.Options().also { it.inJustDecodeBounds = true }
          BitmapFactory.decodeFile(file.path, bounds)
          val options = BitmapFactory.Options()
          while (max(bounds.outWidth, bounds.outHeight) / options.inSampleSize.coerceAtLeast(1) > 2048) options.inSampleSize = options.inSampleSize.coerceAtLeast(1) * 2
          val decoded = requireNotNull(BitmapFactory.decodeFile(file.path, options)) { "INVALID_SPLIT_IMAGE" }
          var preview: Bitmap? = null
          try {
            val orientation = try { ExifInterface(file.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) } catch (_: Exception) { 1 }
            val matrix = Matrix().apply { when (orientation) {
              2 -> setScale(-1f, 1f); 3 -> setRotate(180f); 4 -> setScale(1f, -1f)
              5 -> { setRotate(90f); postScale(-1f, 1f) }; 6 -> setRotate(90f)
              7 -> { setRotate(90f); postScale(1f, -1f) }; 8 -> setRotate(270f)
            } }
            preview = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
            check(id)
            JSONObject().put("width", original.width).put("height", original.height)
              .put("previewUri", save(preview, dir, "preview")).put("previewWidth", preview.width).put("previewHeight", preview.height).toString()
          } finally { if (preview !== decoded) preview?.recycle(); decoded.recycle() }
        }
      } catch (error: Throwable) { dir.deleteRecursively(); throw error }
    }
    AsyncFunction("imageInfo") { uri: String ->
      TiledImage(local(uri)).use { image -> JSONObject().put("width", image.width).put("height", image.height).toString() }
    }
    Function("cancel") { id: String -> cancelled.add(id); Unit }
    AsyncFunction("cleanup") { id: String -> directory(id).deleteRecursively(); cancelled.remove(id); Unit }
    AsyncFunction("analyze") { uri: String, json: String, id: String ->
      val dir = directory(id)
      try {
        check(id); StickerInput.inspect(local(uri))
        val options = JSONObject(json)
        TiledImage(local(uri)).use { original ->
          val crop = options.getJSONObject("crop")
          val regionLeft = crop.getDouble("x") * original.width
          val regionTop = crop.getDouble("y") * original.height
          val regionRight = (crop.getDouble("x") + crop.getDouble("width")) * original.width
          val regionBottom = (crop.getDouble("y") + crop.getDouble("height")) * original.height
          val w = original.width; val h = original.height
          val results = JSONArray()
          val scratch = listOf("pixels.raw", "labels.raw", "queue.raw").map { File(dir, it) }
          require(dir.usableSpace > w.toLong() * h * 16 + 64 * 1024 * 1024) { "INSUFFICIENT_SCRATCH_SPACE" }
          try {
            DiskPixels(scratch[0], w * h).use { pixels -> DiskPixels(scratch[1], w * h).use { labels -> DiskPixels(scratch[2], w * h).use { queue ->
              original.read(Rect(0, 0, w, h), pixels) { check(id) }
              val automatic = options.optBoolean("autoBackground", false)
              val samples = if (automatic) {
                val bx = floor(regionLeft).toInt().coerceIn(0, w - 1); val by = floor(regionTop).toInt().coerceIn(0, h - 1)
                val bw = (ceil(regionRight).toInt().coerceIn(bx + 1, w) - bx); val bh = (ceil(regionBottom).toInt().coerceIn(by + 1, h) - by)
                StickerSegmentation.sheetSamples(w, h, bx, by, bx + bw, by + bh)
              } else {
                val bx = (options.getDouble("backgroundX") * original.width).toInt().coerceIn(0, original.width - 1)
                val by = (options.getDouble("backgroundY") * original.height).toInt().coerceIn(0, original.height - 1)
                listOf(BackgroundSample(by * w + bx, 1))
              }
              val bg = if (automatic) StickerSegmentation.estimateSheetBackground(pixels, samples) else pixels[samples.single().index]
              val tolerance = options.getDouble("tolerance").coerceIn(0.0, 150.0)
              var outputPixels = 0L
              StickerSegmentation.segmentRegion(pixels, labels, queue, w, h, bg, tolerance, { check(id) },
                { left, top, pw, ph -> StickerSegmentation.keepStickerSize(pw, ph) && left + 1e-6 >= regionLeft && top + 1e-6 >= regionTop && left + pw <= regionRight + 1e-6 && top + ph <= regionBottom + 1e-6 }, true, samples) { label, left, top, pw, ph, output, area ->
                outputPixels += pw.toLong() * ph
                require(outputPixels <= 32_000_000) { "OUTPUT_TOO_LARGE" }
                val part = Bitmap.createBitmap(output, pw, ph, Bitmap.Config.ARGB_8888)
                val resultUri = try { save(part, dir, "part-$label") } finally { part.recycle() }
                DataOutputStream(File(dir, "part-$label.runs").outputStream().buffered()).use { ink ->
                  for (row in 0 until ph) {
                    check(id)
                    var column = 0
                    while (column < pw) {
                      if ((output[row * pw + column] ushr 24) == 0) { column++; continue }
                      val start = column
                      while (column + 1 < pw && (output[row * pw + column + 1] ushr 24) != 0) column++
                      ink.writeInt(top + row); ink.writeInt(left + start); ink.writeInt(left + column); column++
                    }
                  }
                }
                results.put(JSONObject().put("id", "$id-$label").put("uri", resultUri).put("x", left).put("y", top).put("width", pw).put("height", ph).put("area", area))
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
    AsyncFunction("groupEdges") { json: String, distance: Double, id: String ->
      directory(id); check(id)
      require(distance.isFinite() && distance in 0.0..6000.0)
      val parts = JSONArray(json); require(parts.length() <= 4096)
      val edges = JSONArray()
      // Only a spanning forest is needed for the currently selected candidates.
      // Bound the bridge result to 4095 links, even when thousands of dots all touch.
      val parent = IntArray(parts.length()) { it }
      fun root(index: Int): Int { var r = index; while (parent[r] != r) { parent[r] = parent[parent[r]]; r = parent[r] }; return r }
      if (distance > 0) for (i in 0 until parts.length()) {
        check(id); val a = parts.getJSONObject(i)
        withRuns(a) { ar ->
          for (j in i + 1 until parts.length()) {
            check(id); val b = parts.getJSONObject(j)
            if (root(i) == root(j)) continue
            val dx = max(0, max(a.getInt("x") - b.getInt("x") - b.getInt("width"), b.getInt("x") - a.getInt("x") - a.getInt("width"))).toDouble()
            val dy = max(0, max(a.getInt("y") - b.getInt("y") - b.getInt("height"), b.getInt("y") - a.getInt("y") - a.getInt("height"))).toDouble()
            if (dx * dx + dy * dy > distance * distance) continue
            if (withRuns(b) { br -> StickerGeometry.near(ar, br, distance) { check(id) } }) {
              parent[root(j)] = root(i)
              edges.put(JSONArray().put(a.getString("id")).put(b.getString("id")))
            }
          }
        }
      }
      edges.toString()
    }
    AsyncFunction("brushHits") { json: String, pathJson: String, radius: Double, id: String ->
      directory(id); check(id)
      val parts = JSONArray(json); val raw = JSONArray(pathJson)
      require(parts.length() <= 4096 && raw.length() in 1..100000 && radius.isFinite() && radius in 0.0..32000.0)
      val path = (0 until raw.length()).map { val p = raw.getJSONObject(it); InkPoint(p.getDouble("x"), p.getDouble("y")) }
      require(path.all { it.x.isFinite() && it.y.isFinite() })
      val hits = JSONArray()
      val left = path.minOf { it.x } - radius; val right = path.maxOf { it.x } + radius
      val top = path.minOf { it.y } - radius; val bottom = path.maxOf { it.y } + radius
      for (i in 0 until parts.length()) {
        check(id); val part = parts.getJSONObject(i)
        if (part.getInt("x") > right || part.getInt("y") > bottom || part.getInt("x") + part.getInt("width") < left || part.getInt("y") + part.getInt("height") < top) continue
        if (withRuns(part) { StickerGeometry.hit(it, path, radius) { check(id) } }) hits.put(part.getString("id"))
      }
      hits.toString()
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
