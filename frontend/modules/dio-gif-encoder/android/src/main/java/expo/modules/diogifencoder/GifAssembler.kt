package expo.modules.diogifencoder

import java.io.OutputStream

/**
 * 찍은 페이지 장면들을 GIF 로 묶는다. frontend/src/editor/utils/gifExport.js 의 createGifAssembler 를 그대로 옮긴 것이고,
 * 같은 입력이면 같은 바이트를 낸다(GifAssemblerTest). 고칠 때는 두 곳을 함께 고친다.
 * 1단계: 모든 장면의 색을 모아(addColors) 255색 팔레트를 만든다(median cut, 상자 안 오차가 큰 것부터 나눈다).
 * 2단계: 장면마다 팔레트 번호로 바꾸고, 앞 장면과 달라진 사각형만 저장한다(나머지는 투명 → 앞 장면이 그대로 보임).
 * 첫 장면은 페이지 전체, 그다음부터는 움직이는 곳만 찍은 사각형(rgba 는 그 크기)을 받을 수 있다.
 * GIF 바이트 형식과 LZW 는 omggif 의 GifWriter 와 같다.
 */
class GifAssembler(private val width: Int, private val height: Int, sink: OutputStream) {
  private val out = object : OutputStream() {
    var count = 0L
    override fun write(b: Int) { sink.write(b); count++ }
    override fun write(b: ByteArray, off: Int, len: Int) { sink.write(b, off, len); count += len }
    override fun flush() = sink.flush()
  }
  /** 지금까지 쓴 바이트 수 */
  val written get() = out.count
  private val histogram = IntArray(32768)
  private var colors: Array<IntArray>? = null
  private val lut = IntArray(32768) { -1 }
  private var previous: ByteArray? = null
  private var pending: Pending? = null
  private val lzw = LzwEncoder()

  private class Pending(val x: Int, val y: Int, val w: Int, val h: Int, val pixels: ByteArray, var delay: Int, val first: Boolean)
  private class Box(val bins: IntArray, val count: Double, val sum: DoubleArray, val square: DoubleArray, val error: Double)

  init {
    require(width in 1..65535 && height in 1..65535) { "INVALID_SIZE" }
  }

  private fun binOf(rgba: ByteArray, i: Int): Int {
    val r = rgba[i].toInt() and 0xff
    val g = rgba[i + 1].toInt() and 0xff
    val b = rgba[i + 2].toInt() and 0xff
    return (r shr 3) shl 10 or ((g shr 3) shl 5) or (b shr 3)
  }

  fun addColors(rgba: ByteArray) {
    check(colors == null) { "PALETTE_ALREADY_BUILT" }
    var i = 0
    while (i + 3 < rgba.size) { histogram[binOf(rgba, i)]++; i += 4 }
  }

  private fun channel(bin: Int, c: Int) = if (c == 0) bin shr 10 else if (c == 1) bin shr 5 and 31 else bin and 31

  // 상자 안 색들이 평균색과 얼마나 다른지(픽셀 수 × 거리² 의 합)
  private fun sse(count: Double, sum: Double, square: Double) = if (count != 0.0) square - sum * sum / count else 0.0

  private fun measure(bins: IntArray): Box {
    var count = 0.0
    val sum = DoubleArray(3)
    val square = DoubleArray(3)
    for (bin in bins) {
      val n = histogram[bin].toDouble()
      count += n
      for (c in 0 until 3) { val v = channel(bin, c).toDouble(); sum[c] += v * n; square[c] += v * v * n }
    }
    var error = 0.0
    for (c in 0 until 3) error += sse(count, sum[c], square[c])
    return Box(bins, count, sum, square, error)
  }

  // 한 축으로 줄 세운 뒤 두 쪽 오차 합이 가장 작아지는 곳에서 자른다
  private fun split(box: Box): Pair<Box, Box>? {
    var bestError = 0.0
    var bestBins: IntArray? = null
    var bestAt = 0
    for (axis in 0 until 3) {
      // JS 의 Array.sort 처럼 안정 정렬
      val bins = box.bins.sortedBy { channel(it, axis) }.toIntArray()
      var count = 0.0
      val sum = DoubleArray(3)
      val square = DoubleArray(3)
      for (i in 0 until bins.size - 1) {
        val n = histogram[bins[i]].toDouble()
        count += n
        for (c in 0 until 3) { val v = channel(bins[i], c).toDouble(); sum[c] += v * n; square[c] += v * v * n }
        if (channel(bins[i], axis) == channel(bins[i + 1], axis)) continue
        var error = 0.0
        for (c in 0 until 3) error += sse(count, sum[c], square[c]) + sse(box.count - count, box.sum[c] - sum[c], box.square[c] - square[c])
        if (bestBins == null || error < bestError) { bestError = error; bestBins = bins; bestAt = i + 1 }
      }
    }
    val bins = bestBins ?: return null
    return measure(bins.copyOfRange(0, bestAt)) to measure(bins.copyOfRange(bestAt, bins.size))
  }

  private fun round(v: Double) = Math.round(v).toInt() // JS Math.round 와 같이 .5 는 올린다

  private fun buildPalette(): IntArray {
    val used = ArrayList<Int>()
    for (bin in 0 until 32768) if (histogram[bin] != 0) used.add(bin)
    if (used.isEmpty()) { used.add(0); histogram[0] = 1 }
    var boxes = mutableListOf(measure(used.toIntArray()))
    while (boxes.size < 255) {
      var box = boxes[0]
      for (b in boxes) if (b.error > box.error) box = b
      val halves = (if (box.error > 0) split(box) else null) ?: break
      boxes = boxes.filter { it !== box }.toMutableList().apply { add(halves.first); add(halves.second) }
    }
    val result = boxes.map { box ->
      var count = 0.0
      var r = 0.0; var g = 0.0; var b = 0.0
      var top = box.bins[0]
      for (bin in box.bins) {
        val n = (if (histogram[bin] != 0) histogram[bin] else 1).toDouble()
        count += n
        r += (bin shr 10) * n; g += (bin shr 5 and 31) * n; b += (bin and 31) * n
        if (histogram[bin] > histogram[top]) top = bin
      }
      // 한 색이 상자의 절반 넘게 차지하면(종이 흰색·글자 검정 등) 평균 대신 그 색을 그대로 쓴다
      if (histogram[top].toDouble() * 2 > count) { r = (top shr 10).toDouble(); g = (top shr 5 and 31).toDouble(); b = (top and 31).toDouble(); count = 1.0 }
      intArrayOf(round(r / count * 255 / 31), round(g / count * 255 / 31), round(b / count * 255 / 31))
    }
    colors = result.toTypedArray()
    val palette = IntArray(256)
    result.forEachIndexed { i, (r, g, b) -> palette[i] = r shl 16 or (g shl 8) or b }
    return palette
  }

  // 15비트 색 → 가장 가까운 팔레트 번호. 쓰는 색만 처음 나올 때 찾는다
  private fun nearest(bin: Int): Int {
    val r = (bin shr 10) * 255.0 / 31; val g = (bin shr 5 and 31) * 255.0 / 31; val b = (bin and 31) * 255.0 / 31
    var best = 0
    var bestDistance = Double.POSITIVE_INFINITY
    colors!!.forEachIndexed { i, color ->
      val dr = color[0] - r; val dg = color[1] - g; val db = color[2] - b
      val d = dr * dr * 2 + dg * dg * 4 + db * db * 3
      if (d < bestDistance) { bestDistance = d; best = i }
    }
    lut[bin] = best
    return best
  }

  private fun index(rgba: ByteArray, i: Int): Int {
    val bin = binOf(rgba, i)
    val known = lut[bin]
    return if (known >= 0) known else nearest(bin)
  }

  private fun writeHeader(palette: IntArray) {
    out.write(byteArrayOf(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)) // GIF89a
    writeShort(width); writeShort(height)
    out.write(0x80 or 7) // 전역 팔레트 256색
    out.write(0); out.write(0)
    for (rgb in palette) { out.write(rgb shr 16 and 0xff); out.write(rgb shr 8 and 0xff); out.write(rgb and 0xff) }
    // NETSCAPE2.0 반복(0 = 계속)
    out.write(byteArrayOf(0x21, 0xff.toByte(), 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, 0x03, 0x01, 0, 0, 0))
  }

  private fun writeShort(v: Int) { out.write(v and 0xff); out.write(v shr 8 and 0xff) }

  private fun flush(last: Boolean) {
    val frame = pending ?: return
    // 그래픽 제어 확장: 처리 방식 1(그대로 둠), 첫 장면이 아니면 255 번을 투명으로
    out.write(0x21); out.write(0xf9); out.write(4)
    out.write(1 shl 2 or (if (frame.first) 0 else 1))
    writeShort(frame.delay)
    out.write(if (frame.first) 0 else TRANSPARENT)
    out.write(0)
    out.write(0x2c)
    writeShort(frame.x); writeShort(frame.y); writeShort(frame.w); writeShort(frame.h)
    out.write(0)
    lzw.encode(out, 8, frame.pixels, frame.w * frame.h)
    if (last) out.write(0x3b)
    pending = null
  }

  /** rgba: rect 크기 RGBA. delay: 1/100초. rect 를 생략하면 페이지 전체 */
  fun addFrame(rgba: ByteArray, delay: Int, x: Int = 0, y: Int = 0, w: Int = width, h: Int = height) {
    require(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= width && y + h <= height) { "INVALID_RECT" }
    require(rgba.size >= w * h * 4) { "NOT_ENOUGH_PIXELS" }
    if (colors == null) writeHeader(buildPalette())
    val prev = previous
    if (prev == null) {
      require(w == width && h == height) { "FIRST_FRAME_MUST_COVER_PAGE" }
      val indexed = ByteArray(width * height)
      for (p in indexed.indices) indexed[p] = index(rgba, p * 4).toByte()
      previous = indexed
      pending = Pending(0, 0, width, height, indexed.copyOf(), delay, true)
      return
    }
    // 사각형 안만 번호로 바꿔 앞 장면과 비교한다
    val indexed = ByteArray(w * h)
    var left = width; var top = height; var right = -1; var bottom = -1
    for (ry in 0 until h) for (rx in 0 until w) {
      val q = ry * w + rx
      val n = index(rgba, q * 4).toByte()
      indexed[q] = n
      if (n == prev[(y + ry) * width + x + rx]) continue
      val px = x + rx; val py = y + ry
      if (px < left) left = px; if (px > right) right = px; if (py < top) top = py; bottom = py
    }
    // 달라진 곳이 없으면 앞 장면을 더 오래 보여 준다
    if (right < 0) { pending!!.delay += delay; return }
    flush(false)
    val fw = right - left + 1; val fh = bottom - top + 1
    val pixels = ByteArray(fw * fh)
    for (fy in 0 until fh) for (fx in 0 until fw) {
      val p = (top + fy) * width + left + fx
      val n = indexed[(top + fy - y) * w + left + fx - x]
      pixels[fy * fw + fx] = if (n == prev[p]) TRANSPARENT.toByte() else n
      prev[p] = n
    }
    pending = Pending(left, top, fw, fh, pixels, delay, false)
  }

  fun end() {
    check(pending != null) { "NO_FRAMES" }
    flush(true)
    out.flush()
  }

  companion object { const val TRANSPARENT = 255 }
}

/** omggif 의 GifWriterOutputLZWCodeStream 과 같은 LZW (255바이트 하위 블록으로 나눠 쓴다) */
class LzwEncoder {
  // (앞 코드 << 8 | 다음 번호) → 코드. 표를 비울 때 전부 지우지 않고 세대 번호로 무효화한다
  private val codes = IntArray(1 shl 20)
  private val stamps = IntArray(1 shl 20)
  private var generation = 0
  private val block = ByteArray(256)
  private var blockSize = 0
  private lateinit var out: OutputStream

  private fun put(byte: Int) {
    block[1 + blockSize++] = byte.toByte()
    if (blockSize == 255) { block[0] = 255.toByte(); out.write(block, 0, 256); blockSize = 0 }
  }

  private var cur = 0L
  private var shift = 0
  private var codeSize = 0

  private fun emit(code: Int) {
    cur = cur or (code.toLong() shl shift)
    shift += codeSize
    while (shift >= 8) { put((cur and 0xff).toInt()); cur = cur ushr 8; shift -= 8 }
  }

  fun encode(out: OutputStream, minCodeSize: Int, indices: ByteArray, length: Int) {
    this.out = out
    out.write(minCodeSize)
    blockSize = 0
    cur = 0L
    shift = 0
    val clearCode = 1 shl minCodeSize
    val codeMask = clearCode - 1
    val eoiCode = clearCode + 1
    var nextCode = eoiCode + 1
    codeSize = minCodeSize + 1
    generation++
    var ib = indices[0].toInt() and 0xff and codeMask
    emit(clearCode)
    for (i in 1 until length) {
      val k = indices[i].toInt() and 0xff and codeMask
      val key = ib shl 8 or k
      if (stamps[key] == generation) { ib = codes[key]; continue }
      emit(ib)
      if (nextCode == 4096) { // 표가 차면 비운다
        emit(clearCode)
        nextCode = eoiCode + 1
        codeSize = minCodeSize + 1
        generation++
      } else {
        if (nextCode >= (1 shl codeSize)) ++codeSize
        stamps[key] = generation
        codes[key] = nextCode++
      }
      ib = k
    }
    emit(ib)
    emit(eoiCode)
    // 남은 비트를 바이트로 (omggif 의 emit_bytes_to_buffer(1))
    while (shift >= 1) { put((cur and 0xff).toInt()); cur = cur ushr 8; shift -= 8 }
    if (blockSize > 0) { block[0] = blockSize.toByte(); out.write(block, 0, blockSize + 1) }
    out.write(0)
  }
}
