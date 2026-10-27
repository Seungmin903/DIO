package expo.modules.diostickersplit

import kotlin.random.Random
import java.io.File

private fun ink(vararg rows: InkRun) = object : InkRuns {
  override val size = rows.size
  override fun get(index: Int) = rows[index]
}
fun main() {
  val tests = listOf<Pair<String, () -> Unit>>(
    "exact pixel gap and threshold boundary" to {
      val a = ink(InkRun(0, 0, 0)); val b = ink(InkRun(0, 3, 3))
      check(!StickerGeometry.near(a, b, 1.99)); check(StickerGeometry.near(a, b, 2.0))
      check(!StickerGeometry.near(a, a, 0.0))
    },
    "diagonal distance uses Euclidean pixel edges" to {
      check(!StickerGeometry.near(ink(InkRun(0, 0, 0)), ink(InkRun(3, 3, 3)), 2.82))
      check(StickerGeometry.near(ink(InkRun(0, 0, 0)), ink(InkRun(3, 3, 3)), 2.83))
    },
    "transparent hole and disconnected dot do not hit bounding-box whitespace" to {
      val frame = ink(InkRun(0, 0, 10), InkRun(5, 0, 0), InkRun(5, 10, 10), InkRun(10, 0, 10))
      check(!StickerGeometry.hit(frame, listOf(InkPoint(5.0, 5.0)), 1.0))
      check(StickerGeometry.hit(frame, listOf(InkPoint(0.5, 5.5)), 0.0))
    },
    "brush segments cross tiny dots between input events and include boundary contact" to {
      val dot = ink(InkRun(5, 5, 5))
      check(StickerGeometry.hit(dot, listOf(InkPoint(0.0, 5.5), InkPoint(20.0, 5.5)), 0.0))
      check(StickerGeometry.hit(dot, listOf(InkPoint(4.0, 5.0)), 1.0))
      check(!StickerGeometry.hit(dot, listOf(InkPoint(3.99, 5.0)), 1.0))
    },
    "outside path remains outside rather than bending along the image edge" to {
      check(!StickerGeometry.hit(ink(InkRun(5, 0, 0)), listOf(InkPoint(-10.0, 0.0), InkPoint(-10.0, 20.0)), 1.0))
    },
    "horizontal, vertical and zero-length brush segments" to {
      val run = ink(InkRun(5, 5, 10))
      check(StickerGeometry.hit(run, listOf(InkPoint(7.0, 0.0), InkPoint(7.0, 20.0)), 0.0))
      check(StickerGeometry.hit(run, listOf(InkPoint(7.0, 5.5), InkPoint(7.0, 5.5)), 0.0))
      check(!StickerGeometry.hit(run, listOf(InkPoint(0.0, 0.0), InkPoint(3.0, 3.0)), 1.0))
    },
    "disk-backed runs preserve coordinates with a bounded page cache" to {
      val file = File.createTempFile("ink-runs", ".raw")
      try {
        DiskPixels(file, 6).use { p -> listOf(2, 3, 8, 5, 1, 1).forEachIndexed { i, n -> p[i] = n } }
        DiskPixels(file, 6).use { p ->
          val runs = object : InkRuns { override val size = 2; override fun get(index: Int) = InkRun(p[index * 3], p[index * 3 + 1], p[index * 3 + 2]) }
          check(StickerGeometry.hit(runs, listOf(InkPoint(4.0, 2.5)), 0.0))
        }
      } finally { file.delete() }
    },
    "random run distances match an exhaustive pixel rectangle oracle" to {
      val random = Random(316)
      repeat(100) {
        val ar = (0..7).mapNotNull { y -> if (random.nextBoolean()) InkRun(y, random.nextInt(4), 4 + random.nextInt(4)) else null }
        val br = (0..7).mapNotNull { y -> if (random.nextBoolean()) InkRun(y, 8 + random.nextInt(4), 12 + random.nextInt(4)) else null }
        val distance = random.nextDouble(0.01, 10.0)
        var expected = false
        for (a in ar) for (b in br) for (x in a.left..a.right) for (z in b.left..b.right) {
          val dx = maxOf(0, kotlin.math.abs(x - z) - 1).toDouble(); val dy = maxOf(0, kotlin.math.abs(a.y - b.y) - 1).toDouble()
          if (dx * dx + dy * dy <= distance * distance) expected = true
        }
        check(StickerGeometry.near(ink(*ar.toTypedArray()), ink(*br.toTypedArray()), distance) == expected)
      }
    },
    "invalid inputs and cancellation are explicit" to {
      var cancelled = false
      try { StickerGeometry.hit(ink(InkRun(0, 0, 1)), listOf(InkPoint(1.0, 1.0)), 1.0) { error("CANCELLED") } }
      catch (e: IllegalStateException) { cancelled = e.message == "CANCELLED" }
      check(cancelled)
      check(runCatching { StickerGeometry.near(ink(), ink(), Double.NaN) }.isFailure)
      check(runCatching { StickerGeometry.hit(ink(), emptyList(), 1.0) }.isFailure)
    }
  )
  for ((name, body) in tests) { body(); println("PASS: $name") }
  println("${tests.size} native geometry fixtures passed")
}
