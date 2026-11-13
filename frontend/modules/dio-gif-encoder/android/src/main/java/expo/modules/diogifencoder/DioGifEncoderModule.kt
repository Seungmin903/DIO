package expo.modules.diogifencoder

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.typedarray.Uint8Array
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream

/**
 * 페이지 GIF 묶기(팔레트 · 번호 매기기 · LZW)를 네이티브로 한다. Hermes 에서 JS 로 하면 수 초 ~ 십수 초 걸리던 일이다.
 * JS 의 createGifAssembler 와 같은 순서로 부른다: create → addColors(장면마다) → addFrame(장면마다) → finish.
 * 픽셀은 Uint8Array 로 받아 바로 복사하므로 동기 함수(JS 스레드)로 둔다. 결과는 create 에 준 file:// 경로에 바로 쓴다.
 */
class DioGifEncoderModule : Module() {
  private class Encoder(val stream: OutputStream, val assembler: GifAssembler)

  private val encoders = HashMap<Int, Encoder>()
  private var nextId = 1

  private fun encoder(id: Int) = encoders[id] ?: throw IllegalStateException("UNKNOWN_ENCODER")

  private fun bytes(array: Uint8Array) = ByteArray(array.byteLength).also { array.read(it, 0, array.byteLength) }

  // OutOfMemoryError 는 Exception 이 아니라 그대로 두면 앱이 종료된다. 메모리를 잡는 호출은 모두 OUT_OF_MEMORY 예외로 바꿔
  // JS 가 받아 JS 묶기로 넘어가게 한다
  private inline fun <T> memorySafe(block: () -> T): T =
    try { block() } catch (error: OutOfMemoryError) { throw IllegalStateException("OUT_OF_MEMORY") }

  private fun close(id: Int) {
    val encoder = encoders.remove(id) ?: return
    try { encoder.stream.close() } catch (_: Exception) {}
  }

  override fun definition() = ModuleDefinition {
    Name("DioGifEncoder")

    Function("create") { width: Int, height: Int, uri: String ->
      memorySafe {
        val parsed = Uri.parse(uri)
        require(parsed.scheme == "file") { "LOCAL_FILE_REQUIRED" }
        val stream = BufferedOutputStream(FileOutputStream(File(requireNotNull(parsed.path))), 1 shl 16)
        val assembler = try { GifAssembler(width, height, stream) } catch (error: Throwable) { try { stream.close() } catch (_: Exception) {}; throw error }
        val id = nextId++
        encoders[id] = Encoder(stream, assembler)
        id
      }
    }

    Function("addColors") { id: Int, rgba: Uint8Array -> memorySafe { encoder(id).assembler.addColors(bytes(rgba)) } }

    Function("addFrame") { id: Int, rgba: Uint8Array, delay: Int, x: Int, y: Int, w: Int, h: Int ->
      memorySafe { encoder(id).assembler.addFrame(bytes(rgba), delay, x, y, w, h) }
    }

    /** 마지막 장면을 쓰고 파일을 닫는다. 쓴 바이트 수를 돌려준다 */
    Function("finish") { id: Int ->
      val encoder = encoder(id)
      memorySafe { try { encoder.assembler.end() } finally { close(id) } }
      encoder.assembler.written
    }

    /** 도중에 그만둘 때(취소 · 실패). 파일은 JS 가 지운다 */
    Function("release") { id: Int -> close(id) }

    OnDestroy { encoders.keys.toList().forEach { close(it) } }
  }
}
