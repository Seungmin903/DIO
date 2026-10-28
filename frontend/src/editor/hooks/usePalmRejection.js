import { createContext, useLayoutEffect, useRef } from 'react'
import { stylus, touchKind } from '../utils/stylus'

/**
 * 펜으로 그릴 때 손바닥(손)이 함께 닿는 경우의 처리. 그림 앱들(GoodNotes·Notability·삼성 노트)이 쓰는 방식을 따른다.
 *
 * 펜을 구분할 수 있을 때 (iOS Apple Pencil, Android 개발 빌드·웹의 pointerType)
 *  - 펜이 한 번 보이면 그 뒤로는 펜만 그린다. 손가락·손바닥은 그리지 않고, 두 손가락은 확대·축소·이동만 한다.
 *  - 손바닥이 먼저 닿아 있어도 펜 획은 그대로 그려지고, 펜으로 그리는 중에는 화면이 확대·축소되지 않는다.
 * 구분할 수 없을 때 (Expo Go 등)
 *  1) 두 손가락 확대·축소는 거의 동시에(PINCH_WINDOW_MS 안에) 닿았을 때만. 쓰다가 나중에 닿은 손은 무시한다.
 *  2) 한 획은 처음 닿은 터치 하나만 따라간다. 다른 터치가 닿아도 획이 끊기거나 휘지 않는다.
 *  3) 먼저 닿은 터치가 거의 움직이지 않는데 새 터치가 오면, 먼저 것은 손바닥으로 보고 새 터치로 획을 옮긴다.
 */
export const PINCH_WINDOW_MS = 250
const PALM_STILL_PX = 10

/** 이 안의 usePan 은 손바닥을 거르는 끌기로 바뀐다 (Canvas 가 펜·지우개 입력 영역을 감싼다) */
export const PalmRejectionContext = createContext(false)

/**
 * 손바닥을 거르는 끌기. usePan 과 같은 모양(onStart(event) / onMove(dx, dy, event) / onEnd({ moved, cancelled }))이다.
 * event 는 따라가는 터치 하나의 정보(locationX·Y 는 입력 영역 기준, touches 에는 그 터치 하나)라
 * 입력 쪽의 '두 손가락이면 그리지 않기' 검사에 손바닥이 걸리지 않는다.
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

  const begin = (s, t, kind) => {
    s.track = { id: t.identifier, startX: t.pageX, startY: t.pageY, startTime: Date.now(), moved: 0,
      force: Number.isFinite(t.force) && t.force > 0 ? t.force : null, pen: kind === 'pen' }
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
    const kind = touchKind(t)
    if (stylus.seen) {
      if (kind === 'pen') {
        // 손가락으로 그리던 획(펜을 보기 전에 시작한)은 버리고 펜으로 옮긴다.
        if (s.track && !s.track.pen) finish(s, true)
        if (!s.track) begin(s, t, kind)
        return
      }
      // 펜 모드에서는 손가락·손바닥으로 그리지 않는다.
      // 아직 종류를 모르면(포인터 이벤트가 터치보다 늦게 올 수 있다) 첫 움직임 때 다시 본다.
      if (kind === 'unknown' && stylus.pointerEvents) s.pending.set(t.identifier, t)
      else s.ignored.add(t.identifier)
      return
    }
    if (!s.track) {
      begin(s, t, kind)
      return
    }
    // 손가락(또는 손바닥)으로 그리던 중에 펜이 닿으면 펜으로 옮긴다.
    if (kind === 'pen' && !s.track.pen) {
      finish(s, true)
      begin(s, t, kind)
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
      begin(s, t, kind)
      return
    }
    // 쓰는 중에 닿은 손(바닥)은 무시한다.
    s.ignored.add(t.identifier)
  }

  // 종류를 몰라 미뤄 둔 터치: 지금은 알면 펜일 때 닿았던 자리부터 획을 시작한다.
  const resolvePending = (s) => {
    for (const [id, t] of s.pending) {
      const kind = touchKind(t)
      if (kind === 'unknown') continue
      s.pending.delete(id)
      if (kind === 'pen' && !s.track) begin(s, t, kind)
      else if (kind !== 'pen') s.ignored.add(id)
    }
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

  // move가 생략되어도 뗀 위치까지 확정한다. 다른 손가락의 좌표는 쓰지 않는다.
  const moveTracked = (s, t, isRelease = false) => {
    if (!s.track || !t || !Number.isFinite(t.pageX) || !Number.isFinite(t.pageY)) return
    const dx = t.pageX - s.track.startX
    const dy = t.pageY - s.track.startY
    const moved = dx !== (s.track.dx ?? 0) || dy !== (s.track.dy ?? 0)
    const forceChanged = !isRelease && Number.isFinite(t.force) && t.force !== s.track.force
      && (t.force > 0 || s.track.force > 0)
    // 미지원 0·변함없는 압력의 탭과, 같은 위치에서 해제할 때의 0은 이동이 아니다.
    // 실제 압력 변화나 마지막 위치 변화만 전달한다.
    if (!moved && !forceChanged) return
    s.track.dx = dx
    s.track.dy = dy
    s.track.force = t.force
    s.track.moved = Math.max(s.track.moved, Math.hypot(dx, dy))
    call('onMove', dx, dy, { ...asEvent(s, t), isRelease })
  }
  const finishAt = (s, event) => {
    const e = event?.nativeEvent
    const id = s.track?.id
    if (id == null) return
    const last = e?.changedTouches?.find((t) => t.identifier === id)
      ?? (e?.identifier === id ? e : null)
    moveTracked(s, last, true)
    finish(s, false)
  }

  const responder = useRef({
    onStartShouldSetResponder: () => !handlersRef.current.disabled,
    onMoveShouldSetResponder: () => false,
    // 보는 영역이 두 손가락 확대·축소로 터치를 가져가려 할 때. 새 터치의 onResponderStart 보다 먼저 불리므로
    // 여기서 새로 닿은 터치를 보고 정한다.
    onResponderTerminationRequest: (event) => {
      const s = state.current
      if (!s || s.releasable) return true
      const fresh = touchesOf(event).filter((t) => !s.seen.has(t.identifier))
      const freshPen = fresh.some((t) => touchKind(t) === 'pen')
      if (!s.track) {
        // 그리던 획이 없으면: 새 터치가 펜이면 지키고, 손가락이면 넘긴다.
        if (freshPen) return false
        return true
      }
      // 펜으로 그리는 중이면 지킨다 (손바닥 + 펜이 '두 손가락'으로 보여도 확대·축소하지 않는다)
      if (s.track.pen || freshPen) return false
      // 펜을 아직 못 봤을 때: 첫 터치가 거의 움직이지 않은 채 곧바로 두 번째 손가락이 닿았다 = 확대·축소
      if (fresh.length && s.track.moved <= PALM_STILL_PX && Date.now() - s.track.startTime <= PINCH_WINDOW_MS) {
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
        pending: new Map(),
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
      if (!s) return
      if (s.pending.size) resolvePending(s)
      if (!s.track) return
      const t = (event.nativeEvent.touches ?? []).find((touch) => touch.identifier === s.track.id)
      if (!t) return
      moveTracked(s, t)
    },
    // 터치 하나가 떨어질 때. 따라가던 터치면 그 획을 확정한다. (손바닥이 남아 있어도 다음 펜 터치로 새 획을 시작할 수 있다)
    onResponderEnd: (event) => {
      const s = state.current
      if (!s) return
      const alive = new Set((event.nativeEvent.touches ?? []).map((t) => t.identifier))
      for (const id of [...s.seen]) {
        if (alive.has(id)) continue
        s.seen.delete(id)
        s.ignored.delete(id)
        s.pending.delete(id)
        if (s.track?.id === id) finishAt(s, event)
      }
    },
    onResponderRelease: (event) => {
      if (state.current) finishAt(state.current, event)
      state.current = null
    },
    onResponderTerminate: () => {
      if (state.current) finish(state.current, true)
      state.current = null
    },
  }).current

  return responder
}
