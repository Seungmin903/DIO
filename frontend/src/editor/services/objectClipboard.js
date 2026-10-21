import { useSyncExternalStore } from 'react'

// 복사·잘라 낸 요소. 편집 화면(다이어리 탭)이 바뀌어도 남아 있어서 다른 다이어리에도 붙여 넣는다.
// 앱을 다시 켜면 비워진다. 사진·스티커는 기기 보관소의 같은 원본(mediaFileId)을 가리키므로 다른 다이어리에서도 그대로 보인다.
let copied = []
const listeners = new Set()

export const objectClipboard = {
  get: () => copied,
  set(objects) {
    copied = objects
    listeners.forEach((listener) => listener())
  },
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

/** 지금 복사해 둔 요소 목록 (바뀌면 다시 그린다) */
export function useObjectClipboard() {
  return useSyncExternalStore(objectClipboard.subscribe, objectClipboard.get, objectClipboard.get)
}
