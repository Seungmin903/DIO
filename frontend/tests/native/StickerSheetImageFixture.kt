package expo.modules.diostickersplit

import java.io.File
import javax.imageio.ImageIO

/** Optional local reproduction. User images stay outside the repository. */
fun main(args: Array<String>) {
  val expected = args.firstOrNull() == "--expect-split"
  for (path in if (expected) args.drop(1) else args.toList()) {
    val image = requireNotNull(ImageIO.read(File(path)))
    val w = image.width; val h = image.height
    val data = image.getRGB(0, 0, w, h, null, 0, w)
    val pixels = ArrayPixels(data)
    for ((name, rect) in listOf("full" to doubleArrayOf(0.0, 0.0, 1.0, 1.0), "inner" to doubleArrayOf(0.2, 0.1, 0.8, 0.9))) {
      val left = (rect[0] * w).toInt(); val top = (rect[1] * h).toInt(); val right = (rect[2] * w).toInt(); val bottom = (rect[3] * h).toInt()
      val samples = StickerSegmentation.sheetSamples(w, h, left, top, right, bottom)
      val bg = StickerSegmentation.estimateSheetBackground(pixels, samples)
      var count = 0; var small = 0; var largest = 0
      StickerSegmentation.segmentRegion(pixels, ArrayPixels(IntArray(w * h)), ArrayPixels(IntArray(w * h)), w, h, bg, 35.0, {},
        { x, y, pw, ph -> StickerSegmentation.keepStickerSize(pw, ph) && x >= left && y >= top && x + pw <= right && y + ph <= bottom }, true, samples) { _, _, _, pw, ph, _, _ -> count++; largest = maxOf(largest, pw * ph); if (pw * ph < w * h / 10) small++ }
      println("${File(path).name}: $w x $h, $name: candidates=$count, small=$small, largestBox=$largest, background=${Integer.toHexString(bg)}")
      if (expected) check(small >= 20) { "Sticker sheet remained a single box: $name" }
    }
    image.flush()
  }
}
