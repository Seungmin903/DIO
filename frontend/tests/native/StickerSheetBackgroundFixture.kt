package expo.modules.diostickersplit

private fun splitSheet(data: IntArray, w: Int, samples: List<BackgroundSample>, bg: Int = StickerSegmentation.estimateSheetBackground(ArrayPixels(data), samples), right: Int = w): List<IntArray> {
  val result = mutableListOf<IntArray>()
  StickerSegmentation.segmentRegion(ArrayPixels(data), ArrayPixels(IntArray(data.size)), ArrayPixels(IntArray(data.size)), w, data.size / w, bg, 35.0, {},
    { x, _, pw, _ -> x + pw <= right }, true, samples) { _, x, y, pw, ph, output, area -> result.add(intArrayOf(x, y, pw, ph, area, output.count { it != 0 })) }
  return result
}
private fun framedSheet(): IntArray {
  val p = IntArray(64 * 64) { 0xffebebeb.toInt() }
  for (y in 6..58) for (x in 6..58) p[y * 64 + x] = if (x in listOf(6, 58) || y in listOf(6, 58)) 0xff999999.toInt() else -1
  for (start in listOf(18, 38)) for (y in start until start + 8) for (x in start until start + 8) p[y * 64 + x] = if (x == start || y == start || x == start + 7 || y == start + 7) 0xff000000.toInt() else -1
  return p
}
fun main() {
  val tests = listOf<Pair<String, () -> Unit>>(
    "frame separates inner paper from matching exterior but not the stickers" to {
      val data = framedSheet(); val samples = StickerSegmentation.sheetSamples(64, 64, 0, 0, 64, 64)
      val parts = splitSheet(data, 64, samples)
      check(parts.count { it[2] == 8 && it[3] == 8 && it[5] == 64 } == 2)
      check(parts.size == 3) // Frame remains a separate candidate, not one filled sheet.
    },
    "crop aligned to a frame does not mistake its thin line for the paper" to {
      val data = framedSheet(); val samples = StickerSegmentation.sheetSamples(64, 64, 6, 6, 59, 59)
      check(splitSheet(data, 64, samples).count { it[2] == 8 && it[5] == 64 } == 2)
    },
    "manual paper sample removes its component without erasing white bodies" to {
      check(splitSheet(framedSheet(), 64, listOf(BackgroundSample(10 * 64 + 10, 1)), -1).count { it[2] == 8 && it[5] == 64 } == 2)
    },
    "transparent sheets preserve opaque white and colored artwork" to {
      val p = IntArray(20 * 20)
      for (y in 8..11) for (x in 8..11) p[y * 20 + x] = 0xffff0000.toInt()
      for (y in 2..3) for (x in 2..3) p[y * 20 + x] = -1
      val samples = StickerSegmentation.sheetSamples(20, 20, 0, 0, 20, 20)
      check(StickerSegmentation.estimateSheetBackground(ArrayPixels(p), samples) == 0)
      check(splitSheet(p, 20, samples).map { it[5] }.sorted() == listOf(4, 16))
    },
    "partial-object exclusion still runs after inner background removal" to {
      val samples = StickerSegmentation.sheetSamples(64, 64, 0, 0, 24, 64)
      check(splitSheet(framedSheet(), 64, samples, right = 24).isEmpty())
    }
  )
  for ((name, body) in tests) { body(); println("PASS: $name") }; println("${tests.size} sheet background fixtures passed")
}
