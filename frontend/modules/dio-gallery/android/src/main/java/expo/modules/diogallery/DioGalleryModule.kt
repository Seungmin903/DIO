package expo.modules.diogallery

import android.app.Activity
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import androidx.exifinterface.media.ExifInterface
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID

/**
 * 삼성 기기에서 시스템 사진 선택 창(구글 포토가 함께 뜬다) 대신 기기 갤러리를 연다.
 * 고른 파일은 바이트 그대로 캐시에 복사한다(GIF 원본 유지). 권한은 필요 없다: 갤러리가 고른 파일의 읽기 권한을 넘겨준다.
 */
class DioGalleryModule : Module() {
  private var pending: Promise? = null
  private val context get() = requireNotNull(appContext.reactContext)

  private fun galleryIntent(multiple: Boolean) = Intent(Intent.ACTION_PICK)
    .setType("image/*")
    .setPackage(GALLERY_PACKAGE)
    .apply {
      if (multiple) {
        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        putExtra("multi-pick", true)
        putExtra("pick-max-item", MAX_ITEMS)
      }
    }

  override fun definition() = ModuleDefinition {
    Name("DioGallery")

    Function("isAvailable") {
      galleryIntent(false).resolveActivity(context.packageManager) != null
    }

    AsyncFunction("pick") { multiple: Boolean, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null || pending != null) {
        promise.reject("ERR_GALLERY_BUSY", "갤러리를 열 수 없어요", null)
        return@AsyncFunction
      }
      pending = promise
      try {
        activity.startActivityForResult(galleryIntent(multiple), REQUEST_CODE)
      } catch (error: Exception) {
        pending = null
        promise.reject("ERR_GALLERY_OPEN", error.message, error)
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_CODE) return@OnActivityResult
      val promise = pending ?: return@OnActivityResult
      pending = null
      if (payload.resultCode != Activity.RESULT_OK || payload.data == null) {
        promise.resolve(mapOf("canceled" to true, "assets" to emptyList<Map<String, Any?>>()))
        return@OnActivityResult
      }
      val uris = urisOf(payload.data!!)
      Thread {
        try {
          val assets = uris.map(::copyToCache)
          promise.resolve(mapOf("canceled" to assets.isEmpty(), "assets" to assets))
        } catch (error: Exception) {
          promise.reject("ERR_GALLERY_READ", error.message, error)
        }
      }.start()
    }
  }

  private fun urisOf(data: Intent): List<Uri> {
    val clip = data.clipData
    if (clip != null && clip.itemCount > 0) return (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri }
    return listOfNotNull(data.data)
  }

  private fun copyToCache(uri: Uri): Map<String, Any?> {
    val resolver = context.contentResolver
    val mimeType = resolver.getType(uri)
    var name: String? = null
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) name = cursor.getString(0)
    }
    val directory = File(context.cacheDir, "dio-gallery").apply { mkdirs() }
    val extension = name?.substringAfterLast('.', "")?.takeIf { it.isNotEmpty() }
      ?: mimeType?.substringAfter('/') ?: "jpg"
    val target = File(directory, "${UUID.randomUUID()}.$extension")
    requireNotNull(resolver.openInputStream(uri)).use { input -> target.outputStream().use { input.copyTo(it) } }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(target.path, bounds)
    val turned = ExifInterface(target.path).rotationDegrees.let { it == 90 || it == 270 }
    return mapOf(
      "uri" to Uri.fromFile(target).toString(),
      "fileName" to (name ?: target.name),
      "mimeType" to mimeType,
      "fileSize" to target.length().toDouble(),
      "width" to (if (turned) bounds.outHeight else bounds.outWidth),
      "height" to (if (turned) bounds.outWidth else bounds.outHeight),
    )
  }

  private companion object {
    const val GALLERY_PACKAGE = "com.sec.android.gallery3d"
    const val REQUEST_CODE = 41907
    const val MAX_ITEMS = 100
  }
}
