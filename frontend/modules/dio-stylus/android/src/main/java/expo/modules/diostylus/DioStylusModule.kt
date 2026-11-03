package expo.modules.diostylus

import android.view.MotionEvent
import android.view.Window
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.tan

/**
 * 안드로이드 S펜의 필압 · 기울기. React Native 포인터 이벤트는 안드로이드에서 필압을 0.5 로 고정하고 기울기를 0 으로 보내므로
 * (PointerEventHelper.getPressure), 창의 터치 전달 직전에 펜 MotionEvent 를 읽어 마지막 값을 둔다. JS 는 펜 이벤트마다 sample() 로 가져간다.
 * 기울기는 W3C Pointer Events 의 tiltX · tiltY(도)로 바꾼다. 펜이 아닌 터치는 건드리지 않고 그대로 넘긴다.
 */
class DioStylusModule : Module() {
  @Volatile private var latest: DoubleArray? = null
  private var installedOn: Window? = null

  override fun definition() = ModuleDefinition {
    Name("DioStylus")
    OnCreate { install() }
    OnActivityEntersForeground { install() }
    // [필압 0~1, tiltX, tiltY, 이벤트 시각 ms]. 펜을 아직 쓰지 않았으면 null.
    Function("sample") { latest?.toList() }
  }

  private fun install() {
    val activity = appContext.currentActivity ?: return
    activity.runOnUiThread {
      val window = activity.window
      if (installedOn === window) return@runOnUiThread
      val original = window.callback ?: return@runOnUiThread
      window.callback = object : Window.Callback by original {
        override fun dispatchTouchEvent(event: MotionEvent): Boolean {
          record(event)
          return original.dispatchTouchEvent(event)
        }
      }
      installedOn = window
    }
  }

  private fun record(event: MotionEvent) {
    for (i in 0 until event.pointerCount) {
      val tool = event.getToolType(i)
      if (tool != MotionEvent.TOOL_TYPE_STYLUS && tool != MotionEvent.TOOL_TYPE_ERASER) continue
      // AXIS_TILT: 화면에 수직에서 기운 각(라디안), AXIS_ORIENTATION: 펜이 가리키는 방향(라디안, 0 = 화면 위쪽)
      val tilt = event.getAxisValue(MotionEvent.AXIS_TILT, i).toDouble()
      val orientation = event.getAxisValue(MotionEvent.AXIS_ORIENTATION, i).toDouble()
      val tiltX = Math.toDegrees(atan(tan(tilt) * sin(orientation)))
      val tiltY = Math.toDegrees(atan(-tan(tilt) * cos(orientation)))
      latest = doubleArrayOf(event.getPressure(i).toDouble().coerceIn(0.0, 1.0), tiltX, tiltY, event.eventTime.toDouble())
    }
  }
}
