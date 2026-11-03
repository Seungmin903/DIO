import { useEffect, useSyncExternalStore } from 'react'

// 웹: 앱과 같은 Skia 그리기(strokeSkia.js)를 CanvasKit(wasm)으로 돌리는 통로.
// wasm 은 연필을 처음 쓸 때만 내려받는다(같은 출처 public/vendor/canvaskit — 번들에 넣지 않음, heic-to · pdfjs 와 같은 방식).
// @shopify/react-native-skia 는 불러오는 순간 global.CanvasKit 이 있어야 하므로 로딩이 끝난 뒤에 동적으로 가져온다.
// 로딩 전 · 실패 때는 runtime 이 null 이라 부르는 쪽이 지금 SVG 그림을 그대로 둔다.
const WASM_DIR = 'vendor/canvaskit/0.41.0/'
let state = { status: 'idle', runtime: null }
let pending = null
const listeners = new Set()
const set = next => { state = next; listeners.forEach(listener => listener()) }

export function loadSkia() {
  if (pending) return pending
  if (typeof document === 'undefined') return Promise.resolve(null)
  set({ status: 'loading', runtime: null })
  pending = (async () => {
    const { LoadSkiaWeb } = await import('@shopify/react-native-skia/lib/module/web')
    await LoadSkiaWeb({ locateFile: file => new URL(WASM_DIR + file, document.baseURI).href })
    const [sk, stroke] = await Promise.all([import('@shopify/react-native-skia'), import('./strokeSkia.js')])
    const { Skia, AlphaType, ColorType } = sk
    // 화면 밖 그림은 CPU 표면(WebGL 문맥 수 제한 없음). 읽기 · 올리기가 한 번에 끝나는 동기 경로
    const { JsiSkSurface } = await import('@shopify/react-native-skia/lib/module/skia/web/JsiSkSurface')
    const runtime = { Skia, AlphaType, ColorType, ...stroke, makeSurface: (width, height) => Skia.Surface.Make(width, height),
      // 보이는 캔버스에 바로 그리는 WebGL 표면(쓰는 중 연필). 못 만들면 null
      liveSurface: canvas => { const ref = global.CanvasKit.MakeWebGLCanvasSurface(canvas); return ref ? new JsiSkSurface(global.CanvasKit, ref) : null } }
    set({ status: 'ready', runtime })
    return runtime
  })().catch(error => {
    console.warn('[skia] CanvasKit 을 불러오지 못해 SVG 연필로 둡니다:', error?.message ?? error)
    set({ status: 'failed', runtime: null })
    return null
  })
  return pending
}

const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }
const snapshot = () => state
// enabled=false 면 불러오기를 시작하지 않고 지금 상태만 본다(연필이 없는 페이지는 wasm 을 받지 않는다)
export function useSkiaRuntime(enabled = true) {
  useEffect(() => { if (enabled) loadSkia() }, [enabled])
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
export const skiaState = () => state
