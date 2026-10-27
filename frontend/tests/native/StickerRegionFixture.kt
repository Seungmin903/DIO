package expo.modules.diostickersplit

private fun regionParts(pixels: PixelStore, width: Int, height: Int, left: Double, top: Double, right: Double, bottom: Double): List<IntArray> {
  val parts = mutableListOf<IntArray>()
  StickerSegmentation.segmentRegion(pixels, ArrayPixels(IntArray(pixels.size)), ArrayPixels(IntArray(pixels.size)), width, height, -1, 0.0, {},
    { x, y, w, h -> x + 1e-6 >= left && y + 1e-6 >= top && x + w <= right + 1e-6 && y + h <= bottom + 1e-6 }, true) { _, x, y, w, h, output, _ -> parts.add(intArrayOf(x, y, w, h, output.count { it != 0 })) }
  return parts
}
fun main() {
  val black = 0xff000000.toInt()
  val tests = listOf<Pair<String, () -> Unit>>(
    "only complete objects survive and exact boundary is included" to {
      val p = IntArray(100) { -1 }; p[22] = black; p[44] = black; p[45] = black; p[88] = black
      val parts = regionParts(ArrayPixels(p), 10, 10, 2.0, 2.0, 5.0, 5.0)
      check(parts.size == 1 && parts[0].contentEquals(intArrayOf(2, 2, 1, 1, 1)))
      check(regionParts(ArrayPixels(p), 10, 10, 2.0, 2.0, 6.0, 5.0).size == 2)
    },
    "connected composition crossing selection is excluded rather than clipped" to {
      val p = IntArray(100) { -1 }; for (x in 1..8) p[40 + x] = black
      check(regionParts(ArrayPixels(p), 10, 10, 3.0, 2.0, 7.0, 8.0).isEmpty())
    },
    "image edge objects and transparent internal space retain source coordinates" to {
      val p = IntArray(100)
      for (x in 0..4) { p[x] = black; p[40 + x] = black }; for (y in 0..4) { p[y * 10] = black; p[y * 10 + 4] = black }
      val result = regionParts(ArrayPixels(p), 10, 10, 0.0, 0.0, 5.0, 5.0)
      check(result.single().contentEquals(intArrayOf(0, 0, 5, 5, 16)))
    },
    "white sheet inside a dark photo keeps enclosed white artwork" to {
      val width = 15; val p = IntArray(width * width) { 0xff777777.toInt() }
      for (y in 1..13) for (x in 1..13) p[y * width + x] = -1
      for (x in 5..9) { p[5 * width + x] = black; p[9 * width + x] = black }
      for (y in 5..9) { p[y * width + 5] = black; p[y * width + 9] = black }
      val result = regionParts(ArrayPixels(p), width, width, 3.0, 3.0, 12.0, 12.0)
      check(result.single().contentEquals(intArrayOf(5, 5, 5, 5, 25)))
    },
    "outside components do not consume the 4096 output limit" to {
      val width = 131; val p = IntArray(width * width) { -1 }; for (y in 1 until width step 2) for (x in 1 until width step 2) p[y * width + x] = black
      check(regionParts(ArrayPixels(p), width, width, 0.0, 0.0, 2.0, 2.0).size == 1)
    },
    "outside oversized artwork is excluded before output allocation and size checks" to {
      val width = 3001; val height = 3001
      val pixels = object : PixelStore {
        override val size = width * height
        override fun get(index: Int) = if (index % width >= 20 || index == 2 * width + 2) black else -1
        override fun set(index: Int, value: Int) = error("read only")
      }
      check(regionParts(pixels, width, height, 0.0, 0.0, 10.0, 10.0).single().contentEquals(intArrayOf(2, 2, 1, 1, 1)))
    }
  )
  for ((name, body) in tests) { body(); println("PASS: $name") }; println("${tests.size} native complete-region fixtures passed")
}
