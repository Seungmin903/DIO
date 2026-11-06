import { Platform } from 'react-native'
import { markPenSeen } from '../../shared/drawingInput'
import { nativePenAt } from './stylusSensor.js'

/**
 * 터치가 펜인지 손가락인지 구분한다.
 * - iOS: 포인터 종류를 우선 사용한다. 펜만 모드에서는 압력만으로 펜이라고 추정하지 않는다.
 * - Android(개발 빌드)·웹: 포인터 이벤트의 pointerType('pen' | 'touch' | 'mouse'). 터치 identifier 와 pointerId 가 같다.
 *   Android 는 plugins/withPointerEvents.js 로 포인터 이벤트를 켠다. Expo Go 에서는 오지 않아 'unknown' 이다.
 * 펜이 한 번이라도 보이면(stylus.seen) 그리기 입력을 고른 적 없는 기기는 그 뒤로 펜만 그린다.
 */
export const stylus = { seen: false, pointerEvents: false, activePen: false }

const kinds = new Map()
// iOS pointerId와 touch.identifier는 서로 다른 공간이다. 시작 위치가 유일하게
// 일치하는 활성 접촉만 연결하며, 모호한 경우 추측하지 않는다.
const iosContacts = new Map()
const iosPairs = new Map()
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
  iosContacts.clear()
  iosPairs.clear()
  stylus.activePen = false
}

export function forgetStylusTouch(id) {
  if (Platform.OS !== 'ios') return
  const pointerId = iosPairs.get(id)
  if (pointerId != null && iosContacts.has(pointerId)) iosContacts.get(pointerId).retired = true
  iosPairs.delete(id)
}

/** 보는 영역에서 포인터가 닿을 때(capture) 부른다 */
export function notePointerDown(event) {
  const e = event.nativeEvent
  if (e?.pointerId == null || !e.pointerType) return
  stylus.pointerEvents = true
  kinds.set(e.pointerId, e.pointerType)
  if (Platform.OS === 'ios' && Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
    iosContacts.set(e.pointerId, { x: e.clientX, y: e.clientY, kind: e.pointerType })
  }
  if (e.pointerType === 'pen') notePen()
  refreshActive()
}

/** 포인터가 떨어지거나 취소될 때. Android 는 pointerId 를 다시 쓰므로 지워 둔다. */
export function notePointerUp(event) {
  const id = event.nativeEvent?.pointerId
  if (id != null) {
    kinds.delete(id)
    iosContacts.delete(id)
    for (const [touchId, pointerId] of iosPairs) if (pointerId === id) iosPairs.delete(touchId)
    refreshActive()
  }
}

/** 'pen' | 'touch' | 'unknown' */
export function touchKind(touch, { requirePointer = false } = {}) {
  if (Platform.OS === 'ios') {
    const touchId = touch?.identifier
    let pointerId = iosPairs.get(touchId)
    if (pointerId == null && touchId != null && Number.isFinite(touch?.pageX) && Number.isFinite(touch?.pageY)) {
      const used = new Set(iosPairs.values())
      const matches = [...iosContacts.entries()].filter(([id, p]) => !p.retired && !used.has(id) && Math.hypot(touch.pageX - p.x, touch.pageY - p.y) <= 4)
      if (matches.length === 1) { pointerId = matches[0][0]; iosPairs.set(touchId, pointerId) }
    }
    const kind = iosContacts.get(pointerId)?.kind
    if (kind === 'pen' || kind === 'mouse') return 'pen'
    if (kind) return 'touch'
    // 펜·손가락 모드에서는 포인터가 없을 때 기존 압력 fallback을 유지한다.
    // 활성 포인터와 대응이 모호할 때는 손가락을 펜으로 추정하지 않는다.
    // 터치가 끝난 접촉은 pointerup이 유실돼도 새로운 터치의 fallback을 막지 않는다.
    // 아직 살아 있는 포인터가 있으면 모호한 접촉을 펜으로 추측하지 않는다.
    if (!requirePointer && ![...iosContacts.values()].some(contact => !contact.retired) && (touch?.force ?? 0) > 0) {
      // 3D 터치 아이폰은 손가락도 force 가 있어, 기기 기본값은 아이패드 펜일 때만 남긴다
      if (Platform.isPad) notePen(); else stylus.seen = true
      return 'pen'
    }
    // pointerdown보다 responder가 먼저 오면 이동 시 다시 확인한다.
    return 'unknown'
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

// iOS의 pointerId와 responder identifier는 서로 다르므로 시작 위치로
// 유일하게 대응된 경우에만 같은 접촉으로 인계한다.
export function isSameIOSPenContact(touch, pointerId) {
  if (Platform.OS !== 'ios' || touch?.identifier == null || pointerId == null) return false
  return touchKind(touch, { requirePointer: true }) === 'pen' && iosPairs.get(touch.identifier) === pointerId
}
