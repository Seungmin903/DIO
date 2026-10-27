package expo.modules.diostickersplit

import kotlin.math.*

internal data class BackgroundSample(val index: Int, val weight: Int)

/** Pure algorithm called by the Android bridge and fixture tests. */
internal object StickerSegmentation {
  // Original connected-object bounds, before grouping or preview downsampling.
  fun keepStickerSize(width: Int, height: Int): Boolean = width > 2 && height > 2
  fun sheetSamples(w: Int, h: Int, left: Int, top: Int, right: Int, bottom: Int): List<BackgroundSample> {
    require(left in 0 until right && right <= w && top in 0 until bottom && bottom <= h)
    val samples = mutableListOf<BackgroundSample>()
    fun add(x: Double, y: Double, weight: Int) {
      val px = (left + (right - left - 1) * x).roundToInt().coerceIn(left, right - 1)
      val py = (top + (bottom - top - 1) * y).roundToInt().coerceIn(top, bottom - 1)
      samples.add(BackgroundSample(py * w + px, weight))
    }
    // A sheet's paper is usually in the center; a frame or photo margin must
    // not dominate merely because it lies exactly on the crop perimeter.
    for (y in 0..6) for (x in 0..6) add(0.2 + x * 0.1, 0.2 + y * 0.1, 4)
    for (i in 0..5) { val p = i / 5.0; add(p, 0.0, 1); add(p, 1.0, 1); add(0.0, p, 1); add(1.0, p, 1) }
    return samples
  }
  fun estimateSheetBackground(pixels: PixelStore, samples: List<BackgroundSample>): Int {
    if (samples.any { pixels[it.index] ushr 24 == 0 }) return 0
    val votes = HashMap<Int, LongArray>()
    for ((index, weight) in samples) {
      val p = pixels[index]; val r = (p ushr 16) and 255; val g = (p ushr 8) and 255; val b = p and 255
      val key = ((r / 16) shl 8) or ((g / 16) shl 4) or (b / 16)
      val v = votes.getOrPut(key) { LongArray(4) }; v[0] += weight; v[1] += r * weight; v[2] += g * weight; v[3] += b * weight
    }
    val best = votes.entries.sortedWith(compareByDescending<Map.Entry<Int, LongArray>> { it.value[0] }.thenBy { it.key }).firstOrNull()?.value ?: return -1
    return (255 shl 24) or ((best[1] / best[0]).toInt() shl 16) or ((best[2] / best[0]).toInt() shl 8) or (best[3] / best[0]).toInt()
  }
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
    segmentRegion(pixels, labels, queue, w, h, bg, tolerance, onCheckpoint, { _, _, _, _ -> true }, false, null, emit)
  }
  fun segmentRegion(pixels: PixelStore, labels: PixelStore, queue: PixelStore, w: Int, h: Int, bg: Int, tolerance: Double, onCheckpoint: () -> Unit,
    accept: (Int, Int, Int, Int) -> Boolean, interiorBackground: Boolean = false, samples: List<BackgroundSample>? = null, emit: (Int, Int, Int, Int, Int, IntArray, Int) -> Unit) {
    require(w > 0 && h > 0 && w.toLong() * h == pixels.size.toLong())
    require(labels.size == pixels.size && queue.size == pixels.size)
          fun background(i: Int): Boolean {
            val p = pixels[i]
            if ((p ushr 24) == 0) return true
            if ((bg ushr 24) == 0) return false
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
          var exteriorArea = 0L
          flood(-1, true) { _, left, right -> exteriorArea += right - left + 1 }
          // A selected white sheet may sit inside a darker photo. When no pixel
          // of the chosen background reaches the original edge, use its largest
          // connected patch, never every white interior of the artwork.
          if (interiorBackground && samples != null) {
            val votes = HashMap<Int, Int>(); var nextMark = -3
            for (sample in samples) {
              onCheckpoint()
              val i = sample.index
              if (labels[i] == 0 && background(i)) { seed(i, true); flood(nextMark--, true) { _, _, _ -> } }
              val mark = labels[i]
              if (mark == -1 || mark <= -3) votes[mark] = (votes[mark] ?: 0) + sample.weight
            }
            val chosen = votes.entries.sortedWith(compareByDescending<Map.Entry<Int, Int>> { it.value }.thenByDescending { it.key }).firstOrNull()?.key
            for (i in 0 until pixels.size) {
              if (i % 4096 == 0) onCheckpoint()
              if (labels[i] <= -3) labels[i] = if (labels[i] == chosen) -1 else 0
            }
          } else if (interiorBackground && exteriorArea == 0L) {
            var bestSeed = -1; var bestArea = 0L
            for (i in 0 until pixels.size) {
              if (i % 4096 == 0) onCheckpoint()
              if (labels[i] != 0 || !background(i)) continue
              var area = 0L; seed(i, true); flood(-3, true) { _, left, right -> area += right - left + 1 }
              if (area > bestArea) { bestArea = area; bestSeed = i }
            }
            for (i in 0 until pixels.size) { if (i % 4096 == 0) onCheckpoint(); if (labels[i] == -3) labels[i] = 0 }
            if (bestSeed >= 0) { seed(bestSeed, true); flood(-1, true) { _, _, _ -> } }
          }
          var label = 0; var accepted = 0
          for (start in 0 until pixels.size) {
            if (start % 4096 == 0) onCheckpoint()
            if (labels[start] != 0 || (pixels[start] ushr 24) == 0) continue
            label++; tail = 0; seed(start, false)
            var left = w; var top = h; var right = 0; var bottom = 0
            var area = 0
            flood(label, false) { y, x0, x1 ->
              left = min(left, x0); right = max(right, x1); top = min(top, y); bottom = max(bottom, y); area += x1 - x0 + 1
            }
            val pw = right - left + 1; val ph = bottom - top + 1
            if (!accept(left, top, pw, ph)) continue
            require(accepted++ < 4096) { "TOO_MANY_PARTS" }
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
