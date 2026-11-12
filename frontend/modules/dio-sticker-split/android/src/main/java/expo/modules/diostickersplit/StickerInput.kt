package expo.modules.diostickersplit

import java.io.File
import java.io.RandomAccessFile
import java.util.zip.CRC32

/** Strict split-only policy; ordinary photo/GIF import uses its existing policy. */
internal object StickerInput {
  fun inspect(file: File): String {
    require(file.length() in 1..50L * 1024 * 1024) { if (file.length() == 0L) "INVALID_SPLIT_IMAGE" else "SPLIT_FILE_TOO_LARGE" }
    RandomAccessFile(file, "r").use { input ->
      val header = ByteArray(minOf(4096L, input.length()).toInt()); input.readFully(header)
      fun text(offset: Int, size: Int) = if (offset + size <= header.size) String(header, offset, size, Charsets.ISO_8859_1) else ""
      if (header.size >= 8 && header.take(8).map { it.toInt() and 255 } == listOf(137, 80, 78, 71, 13, 10, 26, 10)) {
        var offset = 8L; var first = true; var data = false; var end = false
        while (offset + 12 <= input.length()) {
          input.seek(offset)
          val size = input.readInt().toLong() and 0xffffffffL
          val nameBytes = ByteArray(4); input.readFully(nameBytes); val name = String(nameBytes, Charsets.US_ASCII)
          require(size <= input.length() - offset - 12) { "INVALID_SPLIT_IMAGE" }
          if (first) require(name == "IHDR" && size == 13L) { "INVALID_SPLIT_IMAGE" }
          first = false
          require(name != "acTL" && name != "fcTL" && name != "fdAT") { "ANIMATED_SPLIT_IMAGE" }
          val crc = CRC32().apply { update(nameBytes) }; val buffer = ByteArray(8192); var remaining = size
          while (remaining > 0) { val count = minOf(remaining, buffer.size.toLong()).toInt(); input.readFully(buffer, 0, count); crc.update(buffer, 0, count); remaining -= count }
          require(crc.value == (input.readInt().toLong() and 0xffffffffL)) { "INVALID_SPLIT_IMAGE" }
          if (name == "IDAT") data = true
          if (name == "IEND") { require(size == 0L) { "INVALID_SPLIT_IMAGE" }; end = true; break }
          offset += size + 12
        }
        require(data && end) { "INVALID_SPLIT_IMAGE" }; return "png"
      }
      if (header.size >= 3 && header[0] == 0xff.toByte() && header[1] == 0xd8.toByte() && header[2] == 0xff.toByte()) {
        // A decoder may display a partial JPEG. Reject truncated files before preview.
        val tail = ByteArray(minOf(8192L, input.length()).toInt())
        input.seek(input.length() - tail.size); input.readFully(tail)
        require((0 until tail.size - 1).any { tail[it] == 0xff.toByte() && tail[it + 1] == 0xd9.toByte() }) { "INVALID_SPLIT_IMAGE" }
        return "jpg"
      }
      if (text(0, 4) == "RIFF" && text(8, 4) == "WEBP") {
        fun little(): Long = Integer.reverseBytes(input.readInt()).toLong() and 0xffffffffL
        input.seek(4); val end = little() + 8
        require(end >= 20 && end <= input.length()) { "INVALID_SPLIT_IMAGE" }
        var offset = 12L; var image = false
        while (offset + 8 <= end) {
          input.seek(offset); val nameBytes = ByteArray(4); input.readFully(nameBytes); val name = String(nameBytes, Charsets.US_ASCII)
          val size = little(); require(size <= end - offset - 8) { "INVALID_SPLIT_IMAGE" }
          require(name != "ANIM" && name != "ANMF") { "ANIMATED_SPLIT_IMAGE" }
          if (name == "VP8X") { require(size == 10L) { "INVALID_SPLIT_IMAGE" }; require(input.readUnsignedByte() and 2 == 0) { "ANIMATED_SPLIT_IMAGE" } }
          if (name == "VP8 " || name == "VP8L") { require(size > 0) { "INVALID_SPLIT_IMAGE" }; image = true }
          offset += 8 + size + (size and 1)
        }
        require(image && offset == end) { "INVALID_SPLIT_IMAGE" }; return "webp"
      }
      if (text(0, 6) in listOf("GIF87a", "GIF89a")) error("ANIMATED_SPLIT_IMAGE")
      val prefix = String(header, Charsets.UTF_8).trimStart('\uFEFF', ' ', '\n', '\r', '\t')
      if (Regex("<svg(?:\\s|>)", RegexOption.IGNORE_CASE).containsMatchIn(prefix)) error("SVG_SPLIT_UNSUPPORTED")
      error("UNSUPPORTED_SPLIT_FORMAT")
    }
  }
}
