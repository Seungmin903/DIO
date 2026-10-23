import { Platform } from 'react-native'

/**
 * 터치가 펜인지 손가락인지 구분한다.
 * - iOS: Apple Pencil 은 force 가 0 보다 크다 (손가락은 0)
 * - Android(개발 빌드)·웹: 포인터 이벤트의 pointerType('pen' | 'touch' | 'mouse'). 터치 identifier 와 pointerId 가 같다.
 *   Android 는 plugins/withPointerEvents.js 로 포인터 이벤트를 켠다. Expo Go 에서는 오지 않아 'unknown' 이다.
 * 펜이 한 번이라도 보이면(stylus.seen) 그 뒤로는 펜만 그린다.
 */
export const stylus = { seen: false, pointerEvents: false }

const kinds = new Map()

/** 보는 영역에서 포인터가 닿을 때(capture) 부른다 */
export function notePointerDown(event) {
  const e = event.nativeEvent
  if (e?.pointerId == null || !e.pointerType) return
  stylus.pointerEvents = true
  kinds.set(e.pointerId, e.pointerType)
  if (e.pointerType === 'pen') stylus.seen = true
}

/** 포인터가 떨어지거나 취소될 때. Android 는 pointerId 를 다시 쓰므로 지워 둔다. */
export function notePointerUp(event) {
  const id = event.nativeEvent?.pointerId
  if (id != null) kinds.delete(id)
}

/** 'pen' | 'touch' | 'unknown' */
export function touchKind(touch) {
  if (Platform.OS === 'ios') {
    if ((touch?.force ?? 0) > 0) {
      stylus.seen = true
      return 'pen'
    }
    return 'touch'
  }
  const kind = kinds.get(touch?.identifier)
  // 마우스는 손바닥이 닿을 일이 없어 펜처럼 다룬다 (펜 모드를 켜지는 않는다)
  if (kind === 'pen' || kind === 'mouse') return 'pen'
  if (kind) return 'touch'
  return 'unknown'
}
