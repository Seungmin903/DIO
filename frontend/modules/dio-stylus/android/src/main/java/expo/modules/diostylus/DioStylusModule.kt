package expo.modules.diostylus

import android.util.Log
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
 *
 * S펜 사이드버튼(또는 지우개 끝)이 눌렸는지도 읽어, 바뀔 때 onSideButton 으로 알린다. JS 는 누르는 동안 지우개로 바꾼다.
 * 획 중간에 도구가 바뀌면 그리던 획이 끊기므로 펜이 화면 위에 떠 있을 때(호버)와 펜을 뗄 때만 상태를 확정한다.
 */
class DioStylusModule : Module() {
  @Volatile private var latest: DoubleArray? = null
  @Volatile private var buttonPressed = false
  private var installedOn: Window? = null

  override fun definition() = ModuleDefinition {
    Name("DioStylus")
    OnCreate { install() }
    OnActivityEntersForeground { install() }
    // 버튼을 누른 채 앱을 벗어나면 뗀 이벤트가 오지 않으므로 뗀 것으로 알려 지우개에 남지 않게 한다.
    OnActivityEntersBackground { sendButton(false) }
    // [필압 0~1, tiltX, tiltY, 이벤트 시각 ms]. 펜을 아직 쓰지 않았으면 null.
    Function("sample") { latest?.toList() }
    // { pressed: Boolean }. 사이드버튼을 누르거나 뗄 때만 보낸다.
    Events("onSideButton")
    // 지금 사이드버튼이 눌려 있는지. 듣는 쪽이 없을 때 보낸 이벤트는 사라지므로 JS 가 구독을 시작할 때 이 값으로 맞춘다.
    Function("isSideButtonPressed") { buttonPressed }
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
          // 펜을 뗀 이벤트가 JS 에 먼저 가서 획이 원래 도구로 끝난 뒤에 도구가 바뀌도록, 전달한 다음에 버튼 상태를 본다.
          val handled = original.dispatchTouchEvent(event)
          when (event.actionMasked) {
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> noteButton(event)
          }
          return handled
        }

        // 펜이 화면에 닿지 않고 떠 있을 때의 호버 이벤트는 터치가 아니라 이쪽으로 온다.
        // HOVER_EXIT 는 뗌으로 보지 않는다. 펜이 화면에 닿기 직전에도 오므로 뗌으로 보면 누른 채 그은 첫 획이 펜으로 돌아간다.
        // 한계: 누른 채 펜을 호버 범위 밖으로 빼서 버튼을 떼면 이벤트가 없어, 다시 호버 범위에 들어올 때(또는 앱이 백그라운드로 갈 때)까지 지우개로 남는다.
        override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
          when (event.actionMasked) {
            MotionEvent.ACTION_HOVER_ENTER, MotionEvent.ACTION_HOVER_MOVE, MotionEvent.ACTION_HOVER_EXIT -> noteButton(event)
          }
          return original.dispatchGenericMotionEvent(event)
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

  private fun noteButton(event: MotionEvent) {
    if (event.pointerCount == 0) return
    val tool = event.getToolType(0)
    if (tool != MotionEvent.TOOL_TYPE_STYLUS && tool != MotionEvent.TOOL_TYPE_ERASER) return
    // 사이드버튼은 BUTTON_STYLUS_PRIMARY 로 오고, 예전 삼성 기기는 BUTTON_SECONDARY 로 보낸다. 지우개 끝은 그 자체로 지우개다.
    val pressed = tool == MotionEvent.TOOL_TYPE_ERASER ||
      (event.buttonState and (MotionEvent.BUTTON_STYLUS_PRIMARY or MotionEvent.BUTTON_SECONDARY)) != 0
    sendButton(pressed)
  }

  private fun sendButton(pressed: Boolean) {
    if (pressed == buttonPressed) return
    // 보내지 못하면 상태를 바꾸지 않아 다음 호버 이벤트가 다시 보낸다(JS 와 어긋난 채 남지 않게).
    try {
      sendEvent("onSideButton", mapOf("pressed" to pressed))
      buttonPressed = pressed
    } catch (error: Exception) {
      Log.w("DioStylus", "onSideButton 전송 실패", error)
    }
  }
}
