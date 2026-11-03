// 안드로이드 S펜의 실제 필압 · 기울기(modules/dio-stylus). React Native 는 안드로이드에서 포인터 이벤트 필압을 0.5 · 기울기를 0 으로 고정하고,
// 펜 획이 실제로 들어오는 터치(responder) 경로에는 필압 · 기울기가 아예 없다. 펜 이벤트마다 네이티브가 읽어 둔 마지막 값으로 바꾼다.
// 모듈이 없는 예전 개발 빌드 · iOS · 웹은 이벤트 값을 그대로 쓴다.
// Expo 네이티브 모듈은 globalThis.expo.modules 에 올라온다(requireOptionalNativeModule 과 같은 곳). 노드 테스트에서도 import 없이 돈다.
let module
const sensor = () => {
  if (module === undefined) module = globalThis.expo?.modules?.DioStylus ?? null
  return module
}
// 터치 경로는 펜인지 모른다. 네이티브가 본 마지막 펜 이벤트가 이 터치 이후(JS 가 밀려 늦게 받을 수 있다)거나 거의 같은 때면 펜으로 본다.
// 두 시각 모두 안드로이드 MotionEvent.eventTime(ms)이다. 펜 다음에 닿은 손가락은 펜 시각보다 늦어서 걸리지 않는다.
const SAME_EVENT_MS = 30, JS_LAG_MS = 1000
export function withStylusSensor(sample) {
  const native = sensor()
  if (!native || sample.pointerType === 'touch' || sample.pointerType === 'mouse') return sample
  let latest = null
  try { latest = native.sample() } catch { return sample }
  if (!Array.isArray(latest) || latest.length < 3) return sample
  const [pressure, tiltX, tiltY, time] = latest
  if (sample.pointerType !== 'pen') {
    const stamp = sample.timestamp
    if (!Number.isFinite(stamp) || !Number.isFinite(time) || time < stamp - SAME_EVENT_MS || time > stamp + JS_LAG_MS) return sample
  }
  return { ...sample, pointerType: 'pen', ...(Number.isFinite(pressure) && !sample.isRelease && { pressure }), ...(Number.isFinite(tiltX) && { tiltX, tiltY }) }
}
