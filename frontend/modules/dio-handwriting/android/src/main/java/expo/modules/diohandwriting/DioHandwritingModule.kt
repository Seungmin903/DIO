package expo.modules.diohandwriting

import android.graphics.Bitmap
import android.graphics.Typeface
import android.net.Uri
import ai.onnxruntime.*
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.io.*
import java.nio.FloatBuffer
import java.nio.LongBuffer
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

private const val MODEL_VERSION = "dmfont-fp32-e5b28ca6-inference-v2"
private const val ENCODER_HASH = "36f39745654a47a352752251429c36fc8f607256a3446d18791bb32b9bfdbab0"
private const val DECODER_HASH = "73ceea513ee8eba489f44a1f9658f2cd22d77fb6881cbd70a79fd307c80f1368"

class DioHandwritingModule : Module() {
  private val executor = Executors.newSingleThreadExecutor()
  private val stop = AtomicBoolean(false)
  private val cancelled = AtomicBoolean(false)
  private val running = AtomicBoolean(false)
  private val lock = Any()
  private var currentId: String? = null
  private val modelVersion = MODEL_VERSION
  private val root get() = File(requireNotNull(appContext.reactContext).filesDir, "dio-handwriting").apply { mkdirs() }

  override fun definition() = ModuleDefinition {
    Name("DioHandwriting")
    Events("onProgress")
    AsyncFunction("capabilities") {
      val assets = requireNotNull(appContext.reactContext).assets
      val bundled = try { assets.open("dio_handwriting/encoder.fp32.onnx").close(); assets.open("dio_handwriting/decoder.fp32.onnx").close(); true } catch (_: Exception) { false }
      mapOf("available" to bundled, "platform" to "android", "precision" to "fp32", "total" to 11172, "modelVersion" to modelVersion,
        "reason" to if (bundled) "" else "개발 빌드에 모델 파일을 준비해 주세요.")
    }
    AsyncFunction("createJob") { snapshot: String ->
      synchronized(lock) {
        check(!running.get()) { "이미 생성 중인 작업이 있어요." }
        val input = JSONObject(snapshot)
        validateInput(input)
        val id = java.util.UUID.randomUUID().toString()
        val folder = jobFolder(id).apply { mkdirs() }
        atomic(File(folder, "input.json"), input.toString())
        val state = JSONObject().put("id", id).put("state", "paused").put("stage", "queued").put("completed", 0).put("total", 11172)
          .put("inputHash", input.getString("inputHash")).put("modelVersion", modelVersion).put("preprocessVersion", input.getString("preprocessVersion"))
        saveState(folder, state)
        launch(id)
        readState(folder).toString()
      }
    }
    AsyncFunction("getJob") { id: String ->
      synchronized(lock) {
        val folder = jobFolder(id); val state = readState(folder)
        if (state.optString("state") == "processing" && !(running.get() && currentId == id)) {
          state.put("state", "paused").put("stage", "interrupted"); saveState(folder, state)
        }
        state.toString()
      }
    }
    // Read only the job's immutable original strokes for detail/revision and migration.
    AsyncFunction("isBusy") { running.get() }
    AsyncFunction("getJobDraft") { id: String ->
      synchronized(lock) {
        JSONObject(File(jobFolder(id), "input.json").readText()).getJSONObject("draft").toString()
      }
    }
    AsyncFunction("latestJob") {
      val latest = File(root, "jobs").listFiles()?.filter { File(it, "state.json").isFile }?.maxByOrNull { File(it, "input.json").lastModified() }
      if (latest == null) null else synchronized(lock) { readState(latest).toString() }
    }
    AsyncFunction("pauseJob") { id: String ->
      checkId(id)
      synchronized(lock) {
        if (currentId == id) stop.set(true)
        readState(jobFolder(id)).toString()
      }
    }
    AsyncFunction("cancelJob") { id: String ->
      synchronized(lock) {
        val folder = jobFolder(id)
        if (currentId == id && running.get()) { cancelled.set(true); stop.set(true) }
        else { val s = readState(folder); check(s.optString("state") != "ready") { "완성된 폰트는 취소할 수 없어요." }; s.put("state", "cancelled"); saveState(folder, s) }
        readState(folder).toString()
      }
    }
    AsyncFunction("resumeJob") { id: String ->
      synchronized(lock) {
        val state = readState(jobFolder(id))
        check(state.optString("state") !in listOf("ready", "cancelled")) { "이 작업은 다시 시작할 수 없어요." }
        // Reject incompatible work before launch changes its saved state.
        validateInput(JSONObject(File(jobFolder(id), "input.json").readText()))
        launch(id); readState(jobFolder(id)).toString()
      }
    }
    AsyncFunction("preview") { snapshot: String, text: String ->
      synchronized(lock) { check(!running.get()) { "전체 생성이 끝나거나 멈춘 뒤 미리볼 수 있어요." }; check(running.compareAndSet(false, true)) }
      stop.set(false)
      try {
        val input = JSONObject(snapshot); validateInput(input)
        val folder = File(root, "previews/${input.getString("inputHash")}").apply { mkdirs() }
        val cache = File(root, "features/${input.getString("inputHash")}").apply { mkdirs() }
        val runtime = Runtime(cache, ::modelFile)
        runtime.use {
          it.register(input.getJSONArray("inputs")) { stop.get() }
          val result = JSONObject()
          for (char in text.toSet().filter { c -> c.code in 0xac00..0xd7a3 }.take(24)) {
            check(!stop.get()) { "미리보기를 멈췄어요. 앱으로 돌아와 다시 확인해 주세요." }
            val file = File(folder, "${char.code}.png")
            val image = Bitmap.createBitmap(128, 128, Bitmap.Config.ARGB_8888)
            val gray = it.generate(char.code)
            image.setPixels(IntArray(16384) { i -> val g = gray[i].toInt() and 255; (255 shl 24) or (g shl 16) or (g shl 8) or g }, 0, 128, 0, 0, 128, 128)
            file.outputStream().use { stream -> check(image.compress(Bitmap.CompressFormat.PNG, 100, stream)) }; image.recycle()
            result.put(char.toString(), Uri.fromFile(file).toString())
          }
          result.toString()
        }
      } finally { running.set(false) }
    }
    OnActivityEntersBackground { stop.set(true) }
    OnDestroy { stop.set(true) }
  }

  private fun checkId(id: String) { require(Regex("[a-f0-9-]{36}").matches(id)) { "잘못된 작업 ID예요." } }
  private fun jobFolder(id: String): File { checkId(id); return File(root, "jobs/$id") }
  private fun readState(folder: File) = JSONObject(File(folder, "state.json").readText())
  private fun atomic(file: File, data: String) {
    val temp = File(file.parentFile, file.name + ".tmp")
    FileOutputStream(temp).use { it.write(data.toByteArray(Charsets.UTF_8)); it.fd.sync() }
    check(temp.renameTo(file)) { "진행 내용을 저장하지 못했어요." }
  }
  private fun saveState(folder: File, state: JSONObject) = atomic(File(folder, "state.json"), state.toString())
  private fun notify(state: JSONObject) { sendEvent("onProgress", mapOf("job" to state.toString())) }
  private fun validateInput(input: JSONObject) {
    require(input.getString("modelVersion") == modelVersion) { "생성기가 업데이트되어 이 작업은 이어 만들 수 없어요. 저장된 손글씨로 새 작업을 시작해 주세요." }
    require(input.getString("preprocessVersion") == "dio-ink-safe90-margin4-fp32-v2") { "입력 전처리 버전이 달라요." }
    require(Regex("[a-f0-9]{64}").matches(input.getString("inputHash")))
    val inputs = input.getJSONArray("inputs")
    val prompts = "값같곬곶깎넋늪닫닭닻됩뗌략몃밟볘뺐뽈솩쐐앉않얘얾엌옳읊죡쮜춰츄퀭틔핀핥훟"
    require(inputs.length() == 36)
    for (i in 0 until 36) {
      val row = inputs.getJSONObject(i)
      require(row.getString("character") == prompts[i].toString())
      val pixels = row.getJSONArray("pixels"); require(pixels.length() == 16384)
      var ink = 0
      for (p in 0 until pixels.length()) { val v = pixels.getInt(p); require(v in 0..255); if (v < 200) ink++ }
      require(ink >= 8) { "${prompts[i]} 입력이 비어 있어요." }
    }
  }

  private fun launch(id: String) {
    check(running.compareAndSet(false, true)) { "다른 생성 작업이 진행 중이에요." }
    currentId = id; stop.set(false); cancelled.set(false)
    val queuedFolder = jobFolder(id)
    val queued = readState(queuedFolder).put("state", "processing").put("stage", "queued")
    saveState(queuedFolder, queued)
    executor.execute {
      val folder = jobFolder(id)
      var state = readState(folder)
      try {
        val input = JSONObject(File(folder, "input.json").readText()); validateInput(input)
        check(input.getString("inputHash") == state.getString("inputHash"))
        state.put("state", "processing").put("stage", "encoding").remove("error")
        saveState(folder, state); notify(state)
        val cache = File(root, "features/${input.getString("inputHash")}").apply { mkdirs() }
        Runtime(cache, ::modelFile).use { runtime ->
          runtime.register(input.getJSONArray("inputs")) { stop.get() }
          var completed = state.getInt("completed")
          // Only a fully committed block is eligible for resume. Uncommitted
          // glyph files may exist and are deterministically regenerated.
          while (completed < 11172 && !stop.get()) {
            val end = minOf(completed + 32, 11172)
            for (i in completed until end) {
              val outline = OutlineFont.outline(runtime.generate(0xac00 + i))
              check(outline.size >= 10) { "${(0xac00 + i).toChar()}의 획을 만들지 못했어요." }
              FileOutputStream(File(folder, "$i.gly")).use { stream -> stream.write(outline); stream.fd.sync() }
            }
            completed = end
            synchronized(lock) { state.put("completed", completed).put("stage", "generating"); saveState(folder, state) }
            notify(state)
          }
        }
        if (stop.get()) {
          state.put("state", if (cancelled.get()) "cancelled" else "paused").put("stage", "paused")
        } else {
          state.put("stage", "building"); saveState(folder, state); notify(state)
          val font = File(folder, "font.ttf")
          if (!font.exists()) OutlineFont.build(font, (0 until 11172).map { 0xac00 + it }, (0 until 11172).map { File(folder, "$it.gly") }, "DIOHW-${id.replace("-", "")}", "나의 손글씨")
          // Android's real font parser must accept the completed file.
          Typeface.createFromFile(font)
          if (cancelled.get()) state.put("state", "cancelled")
          else state.put("state", "ready").put("stage", "ready").put("fontUri", Uri.fromFile(font).toString()).put("family", "DIOHW-${id.replace("-", "")}")
        }
      } catch (error: Exception) {
        state.put("state", if (stop.get() && !cancelled.get()) "paused" else if (cancelled.get()) "cancelled" else "failed")
          .put("error", error.message ?: "폰트를 만들지 못했어요.")
      } finally {
        synchronized(lock) { saveState(folder, state); currentId = null; running.set(false) }
        notify(state)
      }
    }
  }

  private fun modelFile(name: String, expected: String): File {
    val folder = File(root, "models").apply { mkdirs() }; val file = File(folder, name)
    fun hash(f: File): String {
      val digest = MessageDigest.getInstance("SHA-256"); f.inputStream().use { stream -> val buffer = ByteArray(1024 * 1024); while (true) { val n = stream.read(buffer); if (n < 0) break; digest.update(buffer, 0, n) } }
      return digest.digest().joinToString("") { "%02x".format(it) }
    }
    if (file.exists() && hash(file) == expected) return file
    val temp = File(folder, "$name.pending")
    requireNotNull(appContext.reactContext).assets.open("dio_handwriting/$name").use { source -> FileOutputStream(temp).use { target -> source.copyTo(target); target.fd.sync() } }
    check(hash(temp) == expected) { "모델 파일 검증에 실패했어요." }
    check(temp.renameTo(file)); return file
  }

  internal class Runtime(private val cache: File, private val resolveModel: (String, String) -> File) : Closeable {
    private val env = OrtEnvironment.getEnvironment()
    private val options = OrtSession.SessionOptions().apply { setIntraOpNumThreads(2); setInterOpNumThreads(1) }
    private var encoder: OrtSession? = null
    private var decoder: OrtSession? = null
    private val main = Array(68) { FloatArray(65536) }
    private val skip = Array(68) { FloatArray(131072) }
    private val counts = IntArray(68)
    private fun addresses(code: Int): IntArray { val n = code - 0xac00; return intArrayOf(n / 588, 19 + n / 28 % 21, 40 + n % 28) }
    fun register(inputs: JSONArray, paused: () -> Boolean) {
      val stored = File(cache, "features.bin")
      if (stored.exists()) {
        try {
          DataInputStream(BufferedInputStream(FileInputStream(stored))).use { data ->
            check(data.readUTF() == MODEL_VERSION)
            for (a in 0 until 68) { counts[a] = data.readInt(); check(counts[a] > 0); for (i in main[a].indices) main[a][i] = data.readFloat(); for (i in skip[a].indices) skip[a][i] = data.readFloat() }
            check(data.read() == -1)
          }
          return
        } catch (_: Exception) { for (a in 0 until 68) { main[a].fill(0f); skip[a].fill(0f); counts[a] = 0 } }
      }
      encoder = env.createSession(resolveModel("encoder.fp32.onnx", ENCODER_HASH).absolutePath, options)
      for (i in 0 until inputs.length()) {
        check(!paused()) { "생성을 잠시 멈췄어요." }
        val row = inputs.getJSONObject(i); val gray = row.getJSONArray("pixels")
        val image = FloatArray(16384) { gray.getInt(it) / 127.5f - 1f }
        OnnxTensor.createTensor(env, FloatBuffer.wrap(image), longArrayOf(1, 1, 128, 128)).use { tensor ->
          encoder!!.run(mapOf("image" to tensor)).use { result ->
            val features = (result.get("components").get() as OnnxTensor).floatBuffer
            val skips = (result.get("skips").get() as OnnxTensor).floatBuffer
            val addrs = addresses(row.getString("character")[0].code)
            for (r in 0..2) {
              val a = addrs[r]; counts[a]++
              for (p in main[a].indices) main[a][p] += features.get(r * 65536 + p)
              for (p in skip[a].indices) skip[a][p] += skips.get(r * 131072 + p)
            }
          }
        }
      }
      encoder?.close(); encoder = null
      check(counts.all { it > 0 }) { "필요한 자모가 빠져 있어요." }
      for (a in 0 until 68) { for (p in main[a].indices) main[a][p] /= counts[a].toFloat(); for (p in skip[a].indices) skip[a][p] /= counts[a].toFloat() }
      val temp = File(cache, "features.pending")
      FileOutputStream(temp).use { stream ->
        val data = DataOutputStream(BufferedOutputStream(stream)); data.writeUTF(MODEL_VERSION)
        for (a in 0 until 68) { data.writeInt(counts[a]); for (v in main[a]) data.writeFloat(v); for (v in skip[a]) data.writeFloat(v) }
        data.flush(); stream.fd.sync()
      }
      check(temp.renameTo(stored)) { "참조 특징을 저장하지 못했어요." }
    }
    fun generate(code: Int): ByteArray {
      if (decoder == null) decoder = env.createSession(resolveModel("decoder.fp32.onnx", DECODER_HASH).absolutePath, options)
      val a = addresses(code)
      val comp = FloatArray(3 * 65536); val skips = FloatArray(3 * 131072)
      for (r in 0..2) { main[a[r]].copyInto(comp, r * 65536); skip[a[r]].copyInto(skips, r * 131072) }
      OnnxTensor.createTensor(env, FloatBuffer.wrap(comp), longArrayOf(1, 3, 256, 16, 16)).use { c ->
        OnnxTensor.createTensor(env, FloatBuffer.wrap(skips), longArrayOf(1, 3, 128, 32, 32)).use { s ->
          OnnxTensor.createTensor(env, LongBuffer.wrap(a.map { it.toLong() }.toLongArray()), longArrayOf(1, 3)).use { ids ->
            decoder!!.run(mapOf("components" to c, "skips" to s, "component_addresses" to ids)).use { result ->
              val values = (result[0] as OnnxTensor).floatBuffer; var ink = 0
              val pixels = ByteArray(16384) { i -> val v = values.get(i); check(v.isFinite()) { "유효하지 않은 생성 결과예요." }; val gray = kotlin.math.round((v.coerceIn(-1f, 1f) + 1f) * 127.5f).toInt(); if (gray < 200) ink++; gray.toByte() }
              check(ink >= 8) { "${code.toChar()}의 생성 결과가 비어 있어요." }; return pixels
            }
          }
        }
      }
    }
    override fun close() { encoder?.close(); decoder?.close(); options.close() }
  }
}
