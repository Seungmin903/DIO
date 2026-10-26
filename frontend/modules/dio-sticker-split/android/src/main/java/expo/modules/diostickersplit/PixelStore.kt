package expo.modules.diostickersplit

import java.io.Closeable
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

internal interface PixelStore {
  val size: Int
  operator fun get(index: Int): Int
  operator fun set(index: Int, value: Int)
}
internal class ArrayPixels(private val pixels: IntArray) : PixelStore {
  override val size get() = pixels.size
  override fun get(index: Int) = pixels[index]
  override fun set(index: Int, value: Int) { pixels[index] = value }
}

/** Disk-backed arrays with a fixed 2 MiB heap cache per array, independent of image size. */
internal class DiskPixels(path: File, override val size: Int) : PixelStore, Closeable {
  private val file = RandomAccessFile(path, "rw")
  private val pageSize = 16384
  private data class Page(val values: IntArray, var dirty: Boolean = false)
  private val pages = LinkedHashMap<Int, Page>(32, 0.75f, true)
  private val bytes = ByteBuffer.allocate(pageSize * 4).order(ByteOrder.BIG_ENDIAN)
  init { require(size > 0); file.setLength(size.toLong() * 4) }
  private fun flush(key: Int, page: Page) {
    if (!page.dirty) return
    bytes.clear()
    for (value in page.values) bytes.putInt(value)
    file.seek(key.toLong() * pageSize * 4)
    file.write(bytes.array(), 0, page.values.size * 4)
    page.dirty = false
  }
  private fun page(index: Int): Page {
    require(index in 0 until size)
    val key = index / pageSize
    pages[key]?.let { return it }
    if (pages.size >= 32) {
      val entry = pages.entries.first(); flush(entry.key, entry.value); pages.remove(entry.key)
    }
    val values = IntArray(minOf(pageSize, size - key * pageSize))
    bytes.clear(); file.seek(key.toLong() * pageSize * 4); file.readFully(bytes.array(), 0, values.size * 4)
    for (i in values.indices) values[i] = bytes.getInt()
    return Page(values).also { pages[key] = it }
  }
  override fun get(index: Int) = page(index).values[index % pageSize]
  override fun set(index: Int, value: Int) { val p = page(index); p.values[index % pageSize] = value; p.dirty = true }
  fun writeRange(start: Int, values: IntArray, offset: Int, length: Int) {
    require(start >= 0 && start + length <= size && length <= pageSize)
    for ((key, page) in pages) flush(key, page)
    pages.clear(); bytes.clear()
    for (i in offset until offset + length) bytes.putInt(values[i])
    file.seek(start.toLong() * 4); file.write(bytes.array(), 0, length * 4)
  }
  override fun close() { try { for ((key, page) in pages) flush(key, page) } finally { pages.clear(); file.close() } }
}

internal fun orientedPoint(x: Int, y: Int, w: Int, h: Int, orientation: Int): Pair<Int, Int> = when (orientation) {
  2 -> Pair(w - 1 - x, y)
  3 -> Pair(w - 1 - x, h - 1 - y)
  4 -> Pair(x, h - 1 - y)
  5 -> Pair(y, x)
  6 -> Pair(h - 1 - y, x)
  7 -> Pair(h - 1 - y, w - 1 - x)
  8 -> Pair(y, w - 1 - x)
  else -> Pair(x, y)
}
