package expo.modules.diostickersplit

import kotlin.math.*

/** Horizontal opaque pixel runs, sorted by row then x. Sources may be disk backed. */
internal data class InkRun(val y: Int, val left: Int, val right: Int)
internal interface InkRuns { val size: Int; operator fun get(index: Int): InkRun }
internal data class InkPoint(val x: Double, val y: Double)
internal object StickerGeometry {
  fun near(a: InkRuns, b: InkRuns, distance: Double, check: () -> Unit = {}): Boolean {
    require(distance.isFinite() && distance >= 0)
    if (distance == 0.0) return false
    val squared = distance * distance
    var first = 0
    for (i in 0 until a.size) {
      if (i % 128 == 0) check()
      val ar = a[i]
      while (first < b.size && b[first].y + 1 < ar.y - distance) { if (first % 1024 == 0) check(); first++ }
      var j = first
      while (j < b.size) {
        if (j % 1024 == 0) check()
        val br = b[j++]; if (br.y > ar.y + 1 + distance) break
        val dx = max(0, max(ar.left - br.right - 1, br.left - ar.right - 1)).toDouble()
        val dy = max(0, abs(ar.y - br.y) - 1).toDouble()
        if (dx * dx + dy * dy <= squared) return true
      }
    }
    return false
  }
  private fun pointDistance(p: InkPoint, a: InkPoint, b: InkPoint): Double {
    val dx = b.x - a.x; val dy = b.y - a.y
    val length = dx * dx + dy * dy
    val t = if (length == 0.0) 0.0 else (((p.x - a.x) * dx + (p.y - a.y) * dy) / length).coerceIn(0.0, 1.0)
    return (p.x - a.x - t * dx).pow(2) + (p.y - a.y - t * dy).pow(2)
  }
  private fun segmentDistance(a: InkPoint, b: InkPoint, r: InkRun): Double {
    val left = r.left.toDouble(); val right = r.right + 1.0; val top = r.y.toDouble(); val bottom = r.y + 1.0
    var low = 0.0; var high = 1.0
    fun clip(start: Double, delta: Double, lo: Double, hi: Double): Boolean {
      if (delta == 0.0) return start in lo..hi
      val u = (lo - start) / delta; val v = (hi - start) / delta
      low = max(low, min(u, v)); high = min(high, max(u, v)); return low <= high
    }
    if (clip(a.x, b.x - a.x, left, right) && clip(a.y, b.y - a.y, top, bottom)) return 0.0
    fun pointRect(p: InkPoint) = max(0.0, max(left - p.x, p.x - right)).pow(2) + max(0.0, max(top - p.y, p.y - bottom)).pow(2)
    return min(min(pointRect(a), pointRect(b)), listOf(InkPoint(left, top), InkPoint(right, top), InkPoint(left, bottom), InkPoint(right, bottom)).minOf { pointDistance(it, a, b) })
  }
  fun hit(runs: InkRuns, path: List<InkPoint>, radius: Double, check: () -> Unit = {}): Boolean {
    require(path.isNotEmpty() && path.all { it.x.isFinite() && it.y.isFinite() } && radius.isFinite() && radius >= 0)
    val rr = radius * radius
    for (i in 0 until runs.size) {
      if (i % 128 == 0) check()
      val run = runs[i]
      if (path.size == 1 && segmentDistance(path[0], path[0], run) <= rr) return true
      for (j in 1 until path.size) {
        if (j % 1024 == 0) check()
        val a = path[j - 1]; val b = path[j]
        if (max(a.y, b.y) + radius < run.y || min(a.y, b.y) - radius > run.y + 1 ||
          max(a.x, b.x) + radius < run.left || min(a.x, b.x) - radius > run.right + 1) continue
        if (segmentDistance(a, b, run) <= rr) return true
      }
    }
    return false
  }
}
