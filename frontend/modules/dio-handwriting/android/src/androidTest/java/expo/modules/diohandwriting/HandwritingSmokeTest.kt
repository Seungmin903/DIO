package expo.modules.diohandwriting

import android.graphics.Typeface
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import org.json.JSONArray
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.MessageDigest

/** Runs the production runtime and outline writer on Android, not a fake model. */
@RunWith(AndroidJUnit4::class)
class HandwritingSmokeTest {
  @Test fun previousModelInputIsRejectedBeforeWorkStarts() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val module = DioHandwritingModule()
    val validation = module.javaClass.getDeclaredMethod("validateInput", JSONObject::class.java).apply { isAccessible = true }
    val old = JSONObject().put("modelVersion", "dmfont-fp32-e5b28ca6-mobile-v1")
    val before = old.toString()
    try {
      validation.invoke(module, old)
      fail("Old model input must not enter the new runtime")
    } catch (error: java.lang.reflect.InvocationTargetException) {
      assertTrue(error.cause is IllegalArgumentException)
      assertTrue(error.cause!!.message!!.contains("업데이트"))
    }
    assertEquals(before, old.toString())
    val manifest = JSONObject(instrumentation.targetContext.assets.open("dio_handwriting/manifest.json").bufferedReader().use { it.readText() })
    assertEquals("dmfont-fp32-e5b28ca6-inference-v2", manifest.getString("model_version"))
  }

  @Test fun modelToTrueTypeAndCachedReplay() {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    val context = instrumentation.targetContext
    val privateFixture = instrumentation.context.assets.list("")!!.contains("snapshot.json")
    // A checkout can run this without distributing a person's private samples.
    // The system-font fallback checks execution only, not handwriting quality.
    val inputs = if (privateFixture) JSONObject(instrumentation.context.assets.open("snapshot.json").bufferedReader().use { it.readText() }).getJSONArray("inputs") else {
      val rows = JSONArray()
      val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.BLACK; textSize = 96f; typeface = Typeface.DEFAULT }
      for (character in "값같곬곶깎넋늪닫닭닻됩뗌략몃밟볘뺐뽈솩쐐앉않얘얾엌옳읊죡쮜춰츄퀭틔핀핥훟") {
        val bitmap = Bitmap.createBitmap(128, 128, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap); canvas.drawColor(android.graphics.Color.WHITE)
        canvas.drawText(character.toString(), (128f - paint.measureText(character.toString())) / 2f, 100f, paint)
        val pixels = IntArray(16384); bitmap.getPixels(pixels, 0, 128, 0, 0, 128, 128); bitmap.recycle()
        rows.put(JSONObject().put("character", character.toString()).put("pixels", JSONArray(pixels.map { it and 255 })))
      }
      rows
    }
    val folder = File(context.cacheDir, "handwriting-smoke-${System.currentTimeMillis()}").apply { mkdirs() }
    val cache = File(folder, "cache").apply { mkdirs() }
    fun model(name: String, hash: String): File {
      val file = File(folder, name)
      if (!file.exists()) context.assets.open("dio_handwriting/$name").use { input -> file.outputStream().use { input.copyTo(it) } }
      val digest = MessageDigest.getInstance("SHA-256"); file.inputStream().use { input -> val b=ByteArray(1024*1024);while(true){val n=input.read(b);if(n<0)break;digest.update(b,0,n)} }
      assertEquals(hash, digest.digest().joinToString("") { "%02x".format(it) })
      return file
    }
    val characters = "한이민글핀틔퀭도또루요우".toList().sorted()
    // Compare model versions under the same Android ORT/thread configuration.
    // Desktop ORT 1.31 and Android ORT 1.23 can round differently even for v1.
    val oldHashes = mapOf(
      "encoder.fp32.onnx" to "37b11d6788f73c90010bb47121b84c640462a0165a14069f03ecef70f5ade3fc",
      "decoder.fp32.onnx" to "3282f796561b927390acf2adc054f1f9d3223012d6422bfa775e303c65ffd8a2"
    )
    val baselinePixels = mutableMapOf<Char, ByteArray>()
    if (instrumentation.context.assets.list("baseline")?.contains("encoder.fp32.onnx") == true) {
      val oldFolder = File(folder, "v1").apply { mkdirs() }
      DioHandwritingModule.Runtime(File(oldFolder, "cache").apply { mkdirs() }) { name, _ ->
        val old = File(oldFolder, name)
        instrumentation.context.assets.open("baseline/$name").use { input -> old.outputStream().use { input.copyTo(it) } }
        val digest = MessageDigest.getInstance("SHA-256")
        old.inputStream().use { input -> val bytes=ByteArray(1024*1024); while(true) { val n=input.read(bytes); if(n<0)break;digest.update(bytes,0,n) } }
        assertEquals(oldHashes[name], digest.digest().joinToString("") { "%02x".format(it) })
        old
      }.use { runtime ->
        runtime.register(inputs) { false }
        for (character in characters) baselinePixels[character] = runtime.generate(character.code)
      }
    }
    val expected = mutableMapOf<Char, ByteArray>()
    DioHandwritingModule.Runtime(cache, ::model).use { runtime ->
      runtime.register(inputs) { false }
      for (character in characters) {
        val pixels = runtime.generate(character.code); expected[character] = pixels
        assertTrue(pixels.count { (it.toInt() and 255) < 200 } >= 8)
        baselinePixels[character]?.let { original -> assertArrayEquals("Same Android runtime v1/v2: $character", original, pixels) }
        if (instrumentation.context.assets.list("expected")?.contains("${character.code}.gray") == true) {
          val reference = instrumentation.context.assets.open("expected/${character.code}.gray").use { it.readBytes() }
          val delta = pixels.indices.map { kotlin.math.abs((pixels[it].toInt() and 255) - (reference[it].toInt() and 255)) }
          println("DIO_ANDROID_DESKTOP_DELTA: $character max=${delta.max()} mean=${delta.average()}")
          // Retain the pre-existing cross-platform tolerance. Model replacement
          // itself must pass the stricter byte-exact Android comparison above.
          assertTrue("Android/desktop FP32 ${character}: max=${delta.max()}, mean=${delta.average()}", delta.max() <= 2 && delta.average() < .05)
        }
        File(folder, "${character.code}.gly").writeBytes(OutlineFont.outline(pixels))
      }
    }
    // A second runtime must use the private saved features and reproduce bytes.
    DioHandwritingModule.Runtime(cache, ::model).use { runtime ->
      runtime.register(inputs) { false }
      for (character in characters) assertArrayEquals(expected[character], runtime.generate(character.code))
    }
    val font = File(folder, "smoke.ttf")
    OutlineFont.build(font, characters.map { it.code }, characters.map { File(folder, "${it.code}.gly") }, "DIOHW-AndroidSmoke", "Android handwriting smoke")
    assertTrue(font.length() > 1000)
    assertNotNull(Typeface.createFromFile(font))
    fun assertVisible(typeface: Typeface) {
      val bitmap = Bitmap.createBitmap(512, 128, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(bitmap); canvas.drawColor(android.graphics.Color.WHITE)
      canvas.drawText("한이민글", 0f, 100f, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.typeface = typeface; color = android.graphics.Color.BLACK; textSize = 96f })
      val pixels = IntArray(512 * 128); bitmap.getPixels(pixels, 0, 512, 0, 0, 512, 128); bitmap.recycle()
      assertTrue("Typeface must draw real Hangul ink, not just accept the file", pixels.count { (it and 255) < 200 } > 100)
    }
    assertVisible(Typeface.createFromFile(font))
    if (instrumentation.context.assets.list("")!!.contains("full-font.ttf")) {
      val full = File(folder, "full.ttf")
      instrumentation.context.assets.open("full-font.ttf").use { input -> full.outputStream().use { input.copyTo(it) } }
      val paint = Paint().apply { typeface = Typeface.createFromFile(full); textSize = 32f }
      assertVisible(paint.typeface)
      for (code in 0xac00..0xd7a3) assertTrue("Missing U+${code.toString(16)}", paint.hasGlyph(code.toChar().toString()))
    }
    println("DIO_HANDWRITING_SMOKE: ${characters.size} real generated glyphs, cached byte-exact replay, TrueType loaded; byte-exact v1/v2 comparisons=${baselinePixels.size}; references=${if (privateFixture) "private fixture" else "synthetic system font"}; Android emulator/device only, not a phone latency benchmark.")
  }
}
