// 기본(노드 테스트 · 플랫폼 구분 없는 곳): Skia 연필 없이 SVG 그림(fallback)을 그대로 보인다.
// 웹은 PencilSkiaStroke.web.js, 앱은 PencilSkiaStroke.native.js 가 앱과 같은 Skia 그림으로 바꿔 보인다.
import { useEffect, useRef } from 'react'

export default function PencilSkiaStroke({ fallback, onAssetLoad }) {
  // 알림 함수는 매번 새로 만들어져 오므로 ref 로 잡고, 한 번만 알린다
  const notify = useRef(onAssetLoad)
  notify.current = onAssetLoad
  useEffect(() => { notify.current?.() }, [])
  return fallback
}
