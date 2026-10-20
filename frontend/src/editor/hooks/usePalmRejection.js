import { useLayoutEffect, useRef } from 'react'
import { Platform } from 'react-native'

/**
 * 펜과 손바닥(손)이 함께 닿을 때의 처리. 그림 앱들(GoodNotes·Notability·Procreate·삼성 노트)이 쓰는 방식을 따른다.
 *
 * 1) 두 손가락 확대·축소는 '거의 동시에(PINCH_WINDOW_MS 안에) 닿았을 때'만. 쓰다가 나중에 닿은 손은 무시한다.
 * 2) 한 획은 처음 닿은 터치 하나(identifier)만 따라간다. 다른 터치가 닿아도 획이 끊기거나 휘지 않는다.
 * 3) 먼저 닿은 터치가 거의 움직이지 않는데 새 터치가 오면, 먼저 것은 손바닥으로 보고 새 터치로 획을 옮긴다.
 * 4) iOS: Apple Pencil 은 force 가 0 보다 크다(iPad 손가락은 0). 펜이 한 번 보이면 그 뒤로는 펜만 그리고 손가락은 확대·이동만.
 *
 * Android(Expo Go)의 터치 이벤트에는 펜·손가락 구분(toolType)·압력·접촉 크기가 오지 않아 1)~3)의 규칙으로만 거른다.
 * (개발 빌드에서 ReactFeatureFlags.dispatchPointerEvents 를 켜면 pointerType 'pen' 으로 정확히 구분할 수 있다)
 */
export const PINCH_WINDOW_MS = 250
const PALM_STILL_PX = 10

const pen = { seen: false }

/** iOS Apple Pencil 터치인지 */
export function isStylusTouch(touch) {
  return Platform.OS === 'ios' && (touch?.force ?? 0) > 0
}

/** 지금 터치들이 '두 손가락 제스처'인지. 두 터치가 거의 동시에 닿았을 때만 그렇다. */
export function createPinchGate() {
  const starts = new Map()
  return {
    // 터치가 시작될 때마다 부른다(capture 단계). 처음 본 터치의 시각을 적어 둔다.
    note(event) {
      const now = Date.now()
      const touches = event.nativeEvent.touches ?? []
      const alive = new Set(touches.map((t) => t.identifier))
      for (const id of [...starts.keys()]) if (!alive.has(id)) starts.delete(id)
      for (const t of touches) if (!starts.has(t.identifier)) starts.set(t.identifier, now)
    },
    isPinch(event) {
      // 보는 영역이 이미 응답 중이면 시작(capture) 단계를 거치지 않는 터치가 있어 여기서도 적어 둔다.
      this.note(event)
      const touches = event.nativeEvent.touches ?? []
      if (touches.length < 2) return false
      // iOS 에서 펜이 닿아 있으면 확대·축소가 아니다 (펜 + 손바닥)
      if (touches.some(isStylusTouch)) return false
      const a = starts.get(touches[0].identifier)
      const b = starts.get(touches[1].identifier)
      return Math.abs(a - b) <= PINCH_WINDOW_MS
    },
  }
}

/**
 * 펜 입력용 끌기. usePan 과 같은 모양(onStart(event) / onMove(dx, dy, event) / onEnd({ moved, cancelled }))이라
 * 바꿔 끼우기만 하면 된다. event 는 따라가는 터치 하나의 정보(locationX·Y 는 입력 영역 기준)다.
 * 획을 다른 터치로 옮길 때는 앞 획을 onEnd({ cancelled: true }) 로 버리고 onStart 를 새로 부른다.
 */
export function usePalmRejectingPan(handlers) {
  const handlersRef = useRef(handlers)
  useLayoutEffect(() => {
    handlersRef.current = handlers
  })
  const state = useRef(null)

  const call = (name, ...args) => handlersRef.current[name]?.(...args)
  const asEvent = (s, t) => ({
    ...t,
    locationX: t.pageX - s.origin.x,
    locationY: t.pageY - s.origin.y,
    touches: [t],
  })

  const begin = (s, t) => {
    if (isStylusTouch(t)) pen.seen = true
    s.track = { id: t.identifier, startX: t.pageX, startY: t.pageY, startTime: Date.now(), moved: 0, stylus: isStylusTouch(t) }
    call('onStart', asEvent(s, t))
  }
  const finish = (s, cancelled) => {
    if (!s.track) return
    const moved = s.track.moved > PALM_STILL_PX
    s.track = null
    call('onEnd', { moved, cancelled, duration: 0 })
  }

  // 새로 닿은 터치를 어떻게 다룰지 정한다.
  const consider = (s, t) => {
    if (s.track?.id === t.identifier || s.ignored.has(t.identifier)) return
    const stylus = isStylusTouch(t)
    // iOS 에서 펜을 쓰기 시작했으면 손가락으로는 그리지 않는다.
    if (pen.seen && !stylus) {
      s.ignored.add(t.identifier)
      return
    }
    if (!s.track) {
      begin(s, t)
      return
    }
    // 손가락(또는 손바닥)으로 그리던 중에 펜이 닿으면 펜으로 옮긴다.
    if (stylus && !s.track.stylus) {
      finish(s, true)
      begin(s, t)
      return
    }
    const still = s.track.moved <= PALM_STILL_PX
    // 거의 동시에 두 손가락이 닿았다 = 확대·축소. 획을 버리고 보는 영역에 넘긴다.
    if (still && Date.now() - s.track.startTime <= PINCH_WINDOW_MS) {
      finish(s, true)
      s.releasable = true
      return
    }
    // 가만히 있던 첫 터치 = 손바닥. 새 터치로 획을 옮긴다.
    if (still) {
      s.ignored.add(s.track.id)
      finish(s, true)
      begin(s, t)
      return
    }
    // 쓰는 중에 닿은 손(바닥)은 무시한다.
    s.ignored.add(t.identifier)
  }

  // 새로 닿은 터치·떨어진 터치는 changedTouches 대신 '지금 닿아 있는 터치 목록'과 비교해 구한다.
  // (플랫폼마다 changedTouches 에 담기는 터치가 달라서. 웹은 바뀌지 않은 터치도 담는다)
  const touchesOf = (event) => {
    const e = event.nativeEvent
    return e.touches?.length ? e.touches : [e]
  }
  const addNew = (s, event) => {
    for (const t of touchesOf(event)) {
      if (s.seen.has(t.identifier)) continue
      s.seen.add(t.identifier)
      consider(s, t)
    }
  }

  const responder = useRef({
    onStartShouldSetResponder: () => !handlersRef.current.disabled,
    onMoveShouldSetResponder: () => false,
    // 다른 곳(보는 영역의 확대·축소)이 터치를 가져가려 할 때. 새 터치의 onResponderStart 보다 먼저 불리므로
    // 여기서 새로 닿은 터치를 보고 정한다.
    onResponderTerminationRequest: (event) => {
      const s = state.current
      if (!s || s.releasable) return true
      const fresh = touchesOf(event).filter((t) => !s.seen.has(t.identifier))
      if (!s.track) {
        // 그리던 획이 없으면: 새 터치가 그릴 터치(펜, 또는 펜을 아직 못 본 상태의 터치)면 지키고, 아니면 넘긴다.
        return fresh.length ? pen.seen && !fresh.some(isStylusTouch) : true
      }
      // 첫 터치가 거의 움직이지 않은 채 곧바로 두 번째 손가락이 닿았다 = 확대·축소. 획을 버리고 넘긴다.
      if (fresh.length && !pen.seen && s.track.moved <= PALM_STILL_PX && Date.now() - s.track.startTime <= PINCH_WINDOW_MS) {
        finish(s, true)
        s.releasable = true
        return true
      }
      return false
    },
    onResponderGrant: (event) => {
      const e = event.nativeEvent
      state.current = {
        origin: { x: e.pageX - e.locationX, y: e.pageY - e.locationY },
        track: null,
        seen: new Set(),
        ignored: new Set(),
        releasable: false,
      }
      addNew(state.current, event)
    },
    // 응답 중에 터치가 더 닿을 때마다 (첫 터치에도 불릴 수 있어 consider 가 같은 터치는 건너뛴다)
    onResponderStart: (event) => {
      if (state.current) addNew(state.current, event)
    },
    onResponderMove: (event) => {
      const s = state.current
      if (!s?.track) return
      const t = (event.nativeEvent.touches ?? []).find((touch) => touch.identifier === s.track.id)
      if (!t) return
      const dx = t.pageX - s.track.startX
      const dy = t.pageY - s.track.startY
      s.track.moved = Math.max(s.track.moved, Math.hypot(dx, dy))
      call('onMove', dx, dy, asEvent(s, t))
    },
    // 터치 하나가 떨어질 때. 따라가던 터치면 그 획을 확정한다. (손바닥이 남아 있어도 다음 펜 터치로 새 획을 시작할 수 있다)
    onResponderEnd: (event) => {
      const s = state.current
      if (!s) return
      const e = event.nativeEvent
      const alive = new Set((e.touches ?? []).map((t) => t.identifier))
      for (const id of [...s.seen]) {
        if (alive.has(id)) continue
        s.seen.delete(id)
        s.ignored.delete(id)
        if (s.track?.id === id) finish(s, false)
      }
    },
    onResponderRelease: () => {
      if (state.current) finish(state.current, false)
      state.current = null
    },
    onResponderTerminate: () => {
      if (state.current) finish(state.current, true)
      state.current = null
    },
  }).current

  return responder
}
