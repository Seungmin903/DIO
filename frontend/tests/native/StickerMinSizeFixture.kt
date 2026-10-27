package expo.modules.diostickersplit

private fun filtered(pixels: IntArray, w: Int): List<Pair<Int, Int>> {
  val result = mutableListOf<Pair<Int, Int>>()
  StickerSegmentation.segmentRegion(ArrayPixels(pixels), ArrayPixels(IntArray(pixels.size)), ArrayPixels(IntArray(pixels.size)), w, pixels.size / w, -1, 0.0, {},
    { _, _, width, height -> StickerSegmentation.keepStickerSize(width, height) }) { _, _, _, width, height, _, _ -> result.add(width to height) }
  return result
}
fun main() {
  val black = 0xff000000.toInt()
  val tests = listOf<Pair<String, () -> Unit>>(
    "either dimension at most two is excluded, not just two by two" to {
      for ((width, height) in listOf(1 to 1, 2 to 2, 2 to 100, 100 to 2, 1 to 20, 20 to 1, 3 to 3, 3 to 100, 100 to 3)) {
        val w = width + 4; val p = IntArray(w * (height + 4)) { -1 }
        for (y in 2 until height + 2) for (x in 2 until width + 2) p[y * w + x] = black
        val output = filtered(p, w)
        check(output == if (width > 2 && height > 2) listOf(width to height) else emptyList<Pair<Int, Int>>())
      }
    },
    "three by three diagonal survives even with only three opaque pixels" to {
      val p = IntArray(64) { -1 }; for (i in 2..4) p[i * 8 + i] = black
      check(filtered(p, 8) == listOf(3 to 3))
    },
    "thin detail connected to a valid object remains part of the same stroke" to {
      val p = IntArray(100) { -1 }; for (y in 2..4) for (x in 2..4) p[y * 10 + x] = black
      for (x in 5..8) p[3 * 10 + x] = black
      check(filtered(p, 10) == listOf(7 to 3))
    },
    "over 4096 specks do not consume the output candidate limit" to {
      val w = 139; val p = IntArray(w * w) { -1 }
      for (y in 1..129 step 2) for (x in 1..129 step 2) p[y * w + x] = black
      for (y in 134..136) for (x in 134..136) p[y * w + x] = black
      check(filtered(p, w) == listOf(3 to 3))
    }
  )
  for ((name, body) in tests) { body(); println("PASS: $name") }; println("${tests.size} minimum-size fixtures passed")
}
