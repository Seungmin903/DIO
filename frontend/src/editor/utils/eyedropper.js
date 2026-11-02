// 웹: 브라우저 스포이드(EyeDropper)가 있으면 그것을 쓴다. 없으면(사파리 · 파이어폭스) 스포이드 버튼을 두지 않는다
export const eyedropperMode = typeof window !== 'undefined' && 'EyeDropper' in window ? 'browser' : null

export async function captureScreenSampler() { return null }

/** 브라우저 스포이드를 열어 고른 색 → '#RRGGBB'. 취소하면 null */
export async function openBrowserEyedropper() {
  try {
    const { sRGBHex } = await new window.EyeDropper().open()
    return typeof sRGBHex === 'string' ? sRGBHex.toUpperCase() : null
  } catch { return null }
}
