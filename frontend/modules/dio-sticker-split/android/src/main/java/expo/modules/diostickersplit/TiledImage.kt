package expo.modules.diostickersplit

import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Rect
import android.media.ExifInterface
import java.io.Closeable
import java.io.File
import kotlin.math.*

/** Decodes at most a 512×512 source tile, never a full-size source bitmap. */
internal class TiledImage(file: File) : Closeable {
  private val decoder = requireNotNull(BitmapRegionDecoder.newInstance(file.path, false)) { "TILED_DECODE_UNSUPPORTED" }
  private val orientation = try { ExifInterface(file.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) } catch (_: Exception) { 1 }
  val width = if (orientation in 5..8) decoder.height else decoder.width
  val height = if (orientation in 5..8) decoder.width else decoder.height
  init { if (width <= 0 || height <= 0 || width.toLong() * height > 32_000_000) { decoder.recycle(); error("IMAGE_TOO_LARGE") } }
  fun sample(x: Int, y: Int): Int {
    val inverse = when (orientation) { 6 -> 8; 8 -> 6; else -> orientation }
    val (sx, sy) = orientedPoint(x, y, width, height, inverse)
    val image = requireNotNull(decoder.decodeRegion(Rect(sx, sy, sx + 1, sy + 1), BitmapFactory.Options())) { "DECODE_FAILED" }
    return try { image.getPixel(0, 0) } finally { image.recycle() }
  }
  fun read(crop: Rect, target: DiskPixels, check: () -> Unit) {
    for (sy in 0 until decoder.height step 512) for (sx in 0 until decoder.width step 512) {
      check()
      val sw = min(512, decoder.width - sx); val sh = min(512, decoder.height - sy)
      val corners = listOf(orientedPoint(sx, sy, decoder.width, decoder.height, orientation), orientedPoint(sx + sw - 1, sy + sh - 1, decoder.width, decoder.height, orientation))
      val left = corners.minOf { it.first }; val top = corners.minOf { it.second }
      val tw = if (orientation in 5..8) sh else sw; val th = if (orientation in 5..8) sw else sh
      val intersection = Rect(left, top, left + tw, top + th)
      if (!intersection.intersect(crop)) continue
      val image = requireNotNull(decoder.decodeRegion(Rect(sx, sy, sx + sw, sy + sh), BitmapFactory.Options())) { "DECODE_FAILED" }
      val raw = IntArray(sw * sh)
      try { image.getPixels(raw, 0, sw, 0, 0, sw, sh) } finally { image.recycle() }
      val normalized = IntArray(raw.size)
      for (y in 0 until sh) for (x in 0 until sw) {
        val (nx, ny) = orientedPoint(x, y, sw, sh, orientation)
        normalized[ny * tw + nx] = raw[y * sw + x]
      }
      for (y in intersection.top until intersection.bottom) target.writeRange((y - crop.top) * crop.width() + intersection.left - crop.left,
        normalized, (y - top) * tw + intersection.left - left, intersection.width())
    }
  }
  override fun close() { decoder.recycle() }
}
