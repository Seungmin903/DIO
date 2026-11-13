package expo.modules.diogifencoder

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * GifAssembler 가 JS createGifAssembler 와 같은 바이트를 내는지 본다.
 * 입력 · 기대 결과는 modules/dio-gif-encoder/scripts/make-fixture.mjs 가 JS 로 만든다(frontend/tests/gif-native-fixture.test.js 가 맞는지 지킨다).
 */
class GifAssemblerTest {
  private class Frame(val x: Int, val y: Int, val w: Int, val h: Int, val delay: Int, val rgba: ByteArray)

  private fun resource(name: String) = requireNotNull(javaClass.classLoader?.getResourceAsStream(name)) { name }.use { it.readBytes() }

  private fun fixture(): Triple<Int, Int, List<Frame>> {
    val data = ByteBuffer.wrap(resource("gif-fixture.bin")).order(ByteOrder.LITTLE_ENDIAN)
    val width = data.int; val height = data.int; val count = data.int
    val frames = List(count) {
      val x = data.int; val y = data.int; val w = data.int; val h = data.int; val delay = data.int
      Frame(x, y, w, h, delay, ByteArray(w * h * 4).also { data.get(it) })
    }
    return Triple(width, height, frames)
  }

  @Test
  fun sameBytesAsJavaScript() {
    val (width, height, frames) = fixture()
    val out = ByteArrayOutputStream()
    val assembler = GifAssembler(width, height, out)
    frames.forEach { assembler.addColors(it.rgba) }
    frames.forEach { assembler.addFrame(it.rgba, it.delay, it.x, it.y, it.w, it.h) }
    assembler.end()
    val expected = resource("gif-fixture.gif")
    assertArrayEquals(expected, out.toByteArray())
    assertEquals(expected.size.toLong(), assembler.written)
  }

  @Test
  fun firstFrameMustCoverPage() {
    val assembler = GifAssembler(4, 4, ByteArrayOutputStream())
    assembler.addColors(ByteArray(4 * 4 * 4))
    assertThrows(IllegalArgumentException::class.java) { assembler.addFrame(ByteArray(2 * 2 * 4), 10, 0, 0, 2, 2) }
  }

  @Test
  fun rectMustStayInsidePage() {
    val assembler = GifAssembler(4, 4, ByteArrayOutputStream())
    assembler.addColors(ByteArray(4 * 4 * 4))
    assembler.addFrame(ByteArray(4 * 4 * 4), 10)
    assertThrows(IllegalArgumentException::class.java) { assembler.addFrame(ByteArray(3 * 3 * 4), 10, 2, 2, 3, 3) }
  }
}
