package expo.modules.diostickersplit

import kotlin.math.*

/** Pure algorithm called by the Android bridge and fixture tests. */
internal object StickerSegmentation {
  // Quantized perimeter voting avoids choosing a single corner occupied by artwork.
  fun estimateBackground(pixels: IntArray, w: Int, h: Int): Int {
    return estimateBackground(ArrayPixels(pixels), w, h)
  }
  fun estimateBackground(pixels: PixelStore, w: Int, h: Int): Int {
    require(w > 0 && h > 0 && pixels.size == w * h)
    val votes = HashMap<Int, IntArray>()
    fun sample(x: Int, y: Int) {
      val p = pixels[y * w + x]
      if ((p ushr 24) == 0) return
      val r = (p ushr 16) and 255; val g = (p ushr 8) and 255; val b = p and 255
      val key = ((r / 16) shl 8) or ((g / 16) shl 4) or (b / 16)
      val bucket = votes.getOrPut(key) { IntArray(4) }
      bucket[0]++; bucket[1] += r; bucket[2] += g; bucket[3] += b
    }
    for (x in 0 until w) { sample(x, 0); if (h > 1) sample(x, h - 1) }
    for (y in 1 until h - 1) { sample(0, y); if (w > 1) sample(w - 1, y) }
    val best = votes.entries.sortedWith(compareByDescending<Map.Entry<Int, IntArray>> { it.value[0] }.thenBy { it.key }).firstOrNull()?.value ?: return 0xffffffff.toInt()
    return (255 shl 24) or ((best[1] / best[0]) shl 16) or ((best[2] / best[0]) shl 8) or (best[3] / best[0])
  }
  fun segment(pixels: IntArray, w: Int, h: Int, bg: Int, tolerance: Double, onCheckpoint: () -> Unit,
    emit: (Int, Int, Int, Int, Int, IntArray, Int) -> Unit) {
    segmentStored(ArrayPixels(pixels), ArrayPixels(IntArray(pixels.size)), ArrayPixels(IntArray(pixels.size)), w, h, bg, tolerance, onCheckpoint, emit)
  }
  fun segmentStored(pixels: PixelStore, labels: PixelStore, queue: PixelStore, w: Int, h: Int, bg: Int, tolerance: Double, onCheckpoint: () -> Unit,
    emit: (Int, Int, Int, Int, Int, IntArray, Int) -> Unit) {
    require(w > 0 && h > 0 && w.toLong() * h == pixels.size.toLong())
    require(labels.size == pixels.size && queue.size == pixels.size)
          fun background(i: Int): Boolean {
            val p = pixels[i]
            if ((p ushr 24) == 0) return true
            val dr = ((p ushr 16) and 255) - ((bg ushr 16) and 255)
            val dg = ((p ushr 8) and 255) - ((bg ushr 8) and 255)
            val db = (p and 255) - (bg and 255)
            return dr * dr + dg * dg + db * db <= tolerance * tolerance
          }
          // Scanline depth-first fill keeps disk pages local instead of traversing
          // a growing diagonal wavefront across the entire image.
          var tail = 0
          fun eligible(i: Int, exterior: Boolean): Boolean =
            (labels[i] == 0 || labels[i] == -2) && if (exterior) background(i) else (pixels[i] ushr 24) > 0
          fun seed(i: Int, exterior: Boolean) {
            if (labels[i] == 0 && eligible(i, exterior)) { labels[i] = -2; queue[tail++] = i }
          }
          fun adjacent(y: Int, left: Int, right: Int, exterior: Boolean) {
            if (y !in 0 until h) return
            var inRun = false
            for (x in max(0, left)..min(w - 1, right)) {
              val i = y * w + x
              if (eligible(i, exterior)) { if (!inRun) seed(i, exterior); inRun = true } else inRun = false
            }
          }
          fun flood(mark: Int, exterior: Boolean, span: (Int, Int, Int) -> Unit) {
            var steps = 0
            while (tail > 0) {
              if (steps++ % 64 == 0) onCheckpoint()
              val i = queue[--tail]
              if (!eligible(i, exterior)) continue
              val y = i / w
              var left = i % w; var right = left
              while (left > 0 && eligible(y * w + left - 1, exterior)) left--
              while (right + 1 < w && eligible(y * w + right + 1, exterior)) right++
              for (x in left..right) labels[y * w + x] = mark
              span(y, left, right)
              val margin = if (exterior) 0 else 1
              adjacent(y - 1, left - margin, right + margin, exterior)
              adjacent(y + 1, left - margin, right + margin, exterior)
            }
          }
          for (x in 0 until w) { seed(x, true); seed((h - 1) * w + x, true) }
          for (y in 0 until h) { seed(y * w, true); seed(y * w + w - 1, true) }
          flood(-1, true) { _, _, _ -> }
          var label = 0
          for (start in 0 until pixels.size) {
            if (start % 4096 == 0) onCheckpoint()
            if (labels[start] != 0 || (pixels[start] ushr 24) == 0) continue
            require(label < 4096) { "TOO_MANY_PARTS" }
            label++; tail = 0; seed(start, false)
            var left = w; var top = h; var right = 0; var bottom = 0
            var area = 0
            flood(label, false) { y, x0, x1 ->
              left = min(left, x0); right = max(right, x1); top = min(top, y); bottom = max(bottom, y); area += x1 - x0 + 1
            }
            val pw = right - left + 1; val ph = bottom - top + 1
            require(pw.toLong() * ph <= 8_000_000) { "STICKER_TOO_LARGE" }
            val output = IntArray(pw * ph)
            for (y in top..bottom) {
              onCheckpoint()
              for (x in left..right) { val i = y * w + x; if (labels[i] == label) output[(y - top) * pw + x - left] = pixels[i] }
            }
            emit(label, left, top, pw, ph, output, area)
          }
  }
}
