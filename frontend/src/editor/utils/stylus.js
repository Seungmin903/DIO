import { Platform } from 'react-native'
import { markPenSeen } from '../../shared/drawingInput'
import { nativePenAt } from './stylusSensor.js'

/**
 * 터치가 펜인지 손가락인지 구분한다.
 * - iOS: Apple Pencil 은 force 가 0 보다 크다 (손가락은 0)
 * - Android(개발 빌드)·웹: 포인터 이벤트의 pointerType('pen' | 'touch' | 'mouse'). 터치 identifier 와 pointerId 가 같다.
 *   Android 는 plugins/withPointerEvents.js 로 포인터 이벤트를 켠다. Expo Go 에서는 오지 않아 'unknown' 이다.
 * 펜이 한 번이라도 보이면(stylus.seen) 그리기 입력을 고른 적 없는 기기는 그 뒤로 펜만 그린다.
 */
export const stylus = { seen: false, pointerEvents: false, activePen: false }

const kinds = new Map()
const notePen = () => { stylus.seen = true; markPenSeen() }
const refreshActive = () => { stylus.activePen = [...kinds.values()].some(kind => kind === 'pen') }

export function setPenPointerActive(id, active) {
  if (id == null) return
  if (active) { kinds.set(id, 'pen'); notePen() }
  else kinds.delete(id)
  refreshActive()
}

export function resetStylusPointers() {
  kinds.clear()
  stylus.activePen = false
}

/** 보는 영역에서 포인터가 닿을 때(capture) 부른다 */
export function notePointerDown(event) {
  const e = event.nativeEvent
  if (e?.pointerId == null || !e.pointerType) return
  stylus.pointerEvents = true
  kinds.set(e.pointerId, e.pointerType)
  if (e.pointerType === 'pen') notePen()
  refreshActive()
}

/** 포인터가 떨어지거나 취소될 때. Android 는 pointerId 를 다시 쓰므로 지워 둔다. */
export function notePointerUp(event) {
  const id = event.nativeEvent?.pointerId
  if (id != null) {
    kinds.delete(id)
    refreshActive()
  }
}

/** 'pen' | 'touch' | 'unknown' */
export function touchKind(touch) {
  if (Platform.OS === 'ios') {
    if ((touch?.force ?? 0) > 0) {
      // 3D 터치 아이폰은 손가락도 force 가 있어, 기기 기본값은 아이패드 펜일 때만 남긴다
      if (Platform.isPad) notePen(); else stylus.seen = true
      return 'pen'
    }
    return 'touch'
  }
  const kind = kinds.get(touch?.identifier)
  // 마우스는 손바닥이 닿을 일이 없어 펜처럼 다룬다 (펜 모드를 켜지는 않는다)
  if (kind === 'pen' || kind === 'mouse') return 'pen'
  if (kind) return 'touch'
  // 터치가 포인터 이벤트보다 먼저 온다. 펜이 닿아 있지 않은데 네이티브가 이 터치 시각에 펜을 봤으면 펜이다(손바닥과 함께 두 손가락으로 읽히지 않게)
  // 시각으로 짐작한 것이라 기기 기본값(markPenSeen)에는 남기지 않는다. 곧 오는 포인터 이벤트가 확정한다
  if (!stylus.activePen && nativePenAt(touch?.timestamp)) { stylus.seen = true; return 'pen' }
  return 'unknown'
}
