package expo.modules.diostickersplit

import java.io.File
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.util.zip.CRC32

private fun png(animated: Boolean = false): ByteArray {
  val bytes = ByteArrayOutputStream(); val out = DataOutputStream(bytes)
  out.write(byteArrayOf(137.toByte(), 80, 78, 71, 13, 10, 26, 10))
  fun chunk(name: String, data: ByteArray) { val type = name.toByteArray(); out.writeInt(data.size); out.write(type); out.write(data); val crc = CRC32(); crc.update(type); crc.update(data); out.writeInt(crc.value.toInt()) }
  chunk("IHDR", ByteArray(13)); if (animated) chunk("acTL", ByteArray(8)); chunk("IDAT", byteArrayOf(1)); chunk("IEND", byteArrayOf())
  return bytes.toByteArray()
}
private fun webp(animated: Boolean = false): ByteArray {
  val body = ByteArrayOutputStream(); val out = DataOutputStream(body)
  fun chunk(name: String, data: ByteArray) { out.writeBytes(name); out.writeInt(Integer.reverseBytes(data.size)); out.write(data); if (data.size % 2 == 1) out.writeByte(0) }
  out.writeBytes("WEBP")
  if (animated) chunk("VP8X", ByteArray(10).also { it[0] = 2 })
  chunk("VP8L", byteArrayOf(47, 0))
  return ByteArrayOutputStream().also { val stream = DataOutputStream(it); stream.writeBytes("RIFF"); stream.writeInt(Integer.reverseBytes(body.size())); stream.write(body.toByteArray()) }.toByteArray()
}
private fun inspect(bytes: ByteArray, name: String = ".tmp"): String {
  val file = File.createTempFile("sticker-input", name)
  return try { file.writeBytes(bytes); StickerInput.inspect(file) } finally { file.delete() }
}
fun main() {
  val tests = listOf<Pair<String, () -> Unit>>(
    "static PNG JPEG and WebP detected by bytes" to { check(inspect(png()) == "png"); check(inspect(byteArrayOf(255.toByte(), 216.toByte(), 255.toByte(), 217.toByte())) == "jpg"); check(inspect(webp()) == "webp") },
    "missing or misleading extensions do not decide the format" to { check(inspect(png(), ".jpg") == "png"); check(inspect(webp(), ".svg") == "webp") },
    "SVG and other unsupported formats are explicit" to {
      for (value in listOf("<svg width='2'></svg>", "\uFEFF <?xml version='1.0'?>\n<svg></svg>")) check(runCatching { inspect(value.toByteArray()) }.exceptionOrNull()?.message == "SVG_SPLIT_UNSUPPORTED")
      check(runCatching { inspect("0000ftypheic0000".toByteArray()) }.exceptionOrNull()?.message == "UNSUPPORTED_SPLIT_FORMAT")
    },
    "GIF APNG and animated WebP are rejected" to { for (value in listOf("GIF89afoo".toByteArray(), png(true), webp(true))) check(runCatching { inspect(value) }.exceptionOrNull()?.message == "ANIMATED_SPLIT_IMAGE") },
    "truncated containers and bad PNG CRC are rejected" to {
      for (value in listOf(png().dropLast(2).toByteArray(), webp().dropLast(1).toByteArray(), byteArrayOf(255.toByte(), 216.toByte(), 255.toByte(), 0), png().also { it[29] = (it[29].toInt() xor 1).toByte() })) check(runCatching { inspect(value) }.exceptionOrNull()?.message == "INVALID_SPLIT_IMAGE")
    },
    "empty and excessive input fail without decoding" to {
      check(runCatching { inspect(byteArrayOf()) }.exceptionOrNull()?.message == "INVALID_SPLIT_IMAGE")
      val file = File.createTempFile("sticker-size", ".png")
      try { java.io.RandomAccessFile(file, "rw").use { it.setLength(50L * 1024 * 1024 + 1) }; check(runCatching { StickerInput.inspect(file) }.exceptionOrNull()?.message == "SPLIT_FILE_TOO_LARGE") } finally { file.delete() }
    }
  )
  for ((name, body) in tests) { body(); println("PASS: $name") }; println("${tests.size} native format fixtures passed (container validation only; no Android Bitmap execution)")
}
