package expo.modules.diostickersplit

private data class Piece(val x: Int, val y: Int, val w: Int, val h: Int, val pixels: IntArray, val area: Int)
private val white = 0xffffffff.toInt()
private val black = 0xff000000.toInt()
private fun parts(pixels: IntArray, w: Int, tolerance: Double = 0.0, checkpoint: () -> Unit = {}): List<Piece> {
  val result = mutableListOf<Piece>()
  StickerSegmentation.segment(pixels, w, pixels.size / w, white, tolerance, checkpoint) { _, x, y, pw, ph, out, area -> result.add(Piece(x, y, pw, ph, out, area)) }
  return result
}
fun main(args: Array<String>) {
  if (args.firstOrNull() == "large") {
    val dir = kotlin.io.path.createTempDirectory("dio-large-pixels").toFile()
    val w = 3001; val h = 3001
    val began = System.nanoTime()
    try {
      DiskPixels(java.io.File(dir, "pixels"), w * h).use { p ->
        val row = IntArray(w) { white }
        for (y in 0 until h) p.writeRange(y * w, row, 0, w)
        p[(h / 2) * w + w / 2] = black
        DiskPixels(java.io.File(dir, "labels"), w * h).use { labels -> DiskPixels(java.io.File(dir, "queue"), w * h).use { queue ->
          var count = 0
          StickerSegmentation.segmentStored(p, labels, queue, w, h, white, 35.0, {}) { _, x, y, pw, ph, pixels, area ->
            check(x == w / 2 && y == h / 2 && pw == 1 && ph == 1 && area == 1 && pixels.single() == black); count++
          }
          check(count == 1)
        } }
      }
      println("PASS: ${w * h} pixels with 96 MiB JVM heap; ${(System.nanoTime() - began) / 1_000_000} ms")
    } finally { dir.deleteRecursively() }
    return
  }
  val tests = linkedMapOf<String, () -> Unit>(
    "scanline matches independent four-neighbor background and eight-neighbor object oracle" to {
      val random = java.util.Random(73)
      repeat(80) {
        val w = 17; val h = 13; val p = IntArray(w * h) { if (random.nextInt(3) == 0) white else if (random.nextInt(7) == 0) 0 else black }
        val exterior = BooleanArray(p.size); val queue = java.util.ArrayDeque<Int>()
        fun seed(i: Int) { if (!exterior[i] && (p[i] == white || p[i] == 0)) { exterior[i] = true; queue.add(i) } }
        for (x in 0 until w) { seed(x); seed((h - 1) * w + x) }
        for (y in 0 until h) { seed(y * w); seed(y * w + w - 1) }
        while (queue.isNotEmpty()) { val i = queue.removeFirst(); val x = i % w; val y = i / w
          if (x > 0) seed(i - 1); if (x + 1 < w) seed(i + 1); if (y > 0) seed(i - w); if (y + 1 < h) seed(i + w)
        }
        val visited = exterior.copyOf(); val expected = mutableListOf<Set<Int>>()
        for (start in p.indices) {
          if (visited[start] || p[start] == 0) continue
          val component = mutableSetOf<Int>(); queue.add(start); visited[start] = true
          while (queue.isNotEmpty()) { val i = queue.removeFirst(); component.add(i)
            for (dy in -1..1) for (dx in -1..1) { val x = i % w + dx; val y = i / w + dy
              if (x !in 0 until w || y !in 0 until h) continue
              val n = y * w + x; if (!visited[n] && p[n] != 0) { visited[n] = true; queue.add(n) }
            }
          }
          expected.add(component)
        }
        val actual = parts(p, w).map { part -> part.pixels.indices.filter { part.pixels[it] != 0 }.map { (part.y + it / part.w) * w + part.x + it % part.w }.toSet() }
        check(actual == expected)
      }
    },
    "disk paging preserves values across eviction and component boundaries" to {
      val dir = kotlin.io.path.createTempDirectory("dio-pixels").toFile()
      try {
        DiskPixels(java.io.File(dir, "paging"), 600000).use { store ->
          for (i in 0 until 600000 step 137) store[i] = i + 1
          for (i in 599999 downTo 0) check(store[i] == if (i % 137 == 0) i + 1 else 0)
        }
        val w = 520; val h = 35
        val input = IntArray(w * h) { white }
        // A single sticker crosses both a 512px decoder tile seam and a disk page seam.
        for (y in 28..33) for (x in 508..515) input[y * w + x] = black
        val expected = parts(input, w)
        val actual = mutableListOf<Piece>()
        DiskPixels(java.io.File(dir, "pixels"), input.size).use { p ->
          for (y in 0 until h) p.writeRange(y * w, input, y * w, w)
          DiskPixels(java.io.File(dir, "labels"), input.size).use { labels -> DiskPixels(java.io.File(dir, "queue"), input.size).use { queue ->
            StickerSegmentation.segmentStored(p, labels, queue, w, h, white, 0.0, {}) { _, x, y, pw, ph, out, area -> actual.add(Piece(x, y, pw, ph, out, area)) }
          } }
        }
        check(actual.size == expected.size)
        for ((a, b) in actual.zip(expected)) { check(a.x == b.x && a.y == b.y && a.w == b.w && a.h == b.h && a.area == b.area); check(a.pixels.contentEquals(b.pixels)) }
      } finally { dir.deleteRecursively() }
    },
    "all EXIF rotations and mirrors map every source pixel reversibly" to {
      for (orientation in 1..8) {
        val seen = mutableSetOf<Pair<Int, Int>>()
        val w = 7; val h = 3; val nw = if (orientation in 5..8) h else w; val nh = if (orientation in 5..8) w else h
        val inverse = when (orientation) { 6 -> 8; 8 -> 6; else -> orientation }
        for (y in 0 until h) for (x in 0 until w) {
          val p = orientedPoint(x, y, w, h, orientation)
          check(p.first in 0 until nw && p.second in 0 until nh)
          check(seen.add(p)); check(orientedPoint(p.first, p.second, nw, nh, inverse) == Pair(x, y))
        }
      }
    },
    "automatic background ignores artwork in a corner" to {
      val p = IntArray(81) { 0xfff8f8f8.toInt() }; p[0] = black; p[40] = black
      val bg = StickerSegmentation.estimateBackground(p, 9, 9)
      check(bg == 0xfff8f8f8.toInt())
      val result = mutableListOf<Int>()
      StickerSegmentation.segment(p, 9, 9, bg, 35.0, {}) { _, _, _, _, _, _, area -> result.add(area) }
      check(result == listOf(1, 1))
    },
    "automatic background supports transparent and single-row edges" to {
      check(StickerSegmentation.estimateBackground(IntArray(9), 3, 3) == white)
      check(StickerSegmentation.estimateBackground(intArrayOf(white, white, black), 3, 1) == white)
      check(StickerSegmentation.estimateBackground(intArrayOf(white), 1, 1) == white)
    },
    "single-pixel dots and translucent dots survive" to {
      val p = IntArray(81) { white }; p[10] = black; p[60] = 0x01000000
      val r = parts(p, 9); check(r.size == 2); check(r.all { it.area == 1 }); check(r[1].pixels[0] == 0x01000000)
    },
    "white body inside closed outline survives" to {
      val p = IntArray(121) { white }
      for (y in 3..7) for (x in 3..7) if (x == 3 || x == 7 || y == 3 || y == 7) p[y * 11 + x] = black
      val r = parts(p, 11).single(); check(r.area == 25); check(r.pixels[12] == white)
    },
    "diagonal artwork stays one sticker" to {
      val p = IntArray(49) { white }; p[16] = black; p[24] = black
      check(parts(p, 7).size == 1)
    },
    "mask clears empty pixels in bounding rectangle" to {
      val p = IntArray(49) { white }; p[16] = black; p[17] = black; p[23] = black
      val r = parts(p, 7).single(); check(r.area == 3); check(r.pixels.last() == 0)
    },
    "transparent background creates no phantom component" to {
      val p = IntArray(25); p[12] = black
      check(parts(p, 5).single().area == 1)
    },
    "tolerance removes near-background JPEG noise" to {
      val p = IntArray(25) { 0xfff8f8f8.toInt() }; p[12] = black
      check(parts(p, 5, 20.0).single().area == 1)
    },
    "cancellation stops before any part is emitted" to {
      var cancelled = false
      try { parts(IntArray(25) { white }, 5, checkpoint = { throw IllegalStateException("CANCELLED") }) }
      catch (e: IllegalStateException) { cancelled = e.message == "CANCELLED" }; check(cancelled)
    },
    "candidate cap fails rather than silently dropping dots" to {
      val w = 131; val p = IntArray(w * w) { white }
      for (y in 1 until w step 2) for (x in 1 until w step 2) p[y * w + x] = black
      var overflow = false
      try { parts(p, w) } catch (e: IllegalArgumentException) { overflow = e.message == "TOO_MANY_PARTS" }; check(overflow)
    }
  )
  for ((name, body) in tests) { body(); println("PASS: $name") }
  println("${tests.size} native pixel fixtures passed")
}
