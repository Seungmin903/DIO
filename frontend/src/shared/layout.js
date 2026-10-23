// 다이어리 편집 데이터의 공통 좌표계. 플랫폼이 달라도 저장 데이터와 내보내기 크기는 유지한다.
export const TABLET_WIDTH = 1280
export const TABLET_HEIGHT = 800
export const TABLET_ASPECT_RATIO = TABLET_WIDTH / TABLET_HEIGHT

// 홈·편집기 UI를 맞추는 플랫폼별 기준 프레임.
// 실제 기기 크기를 고정하지 않고, 현재 창 안에서 이 비율을 가장 크게 유지한다.
export const TABLET_FRAME_SPECS = Object.freeze({
  ios: Object.freeze({ width: 1024, height: 768 }), // iPad 기준 4:3
  android: Object.freeze({ width: 1280, height: 800 }), // Android 태블릿 기준 16:10
  web: Object.freeze({ width: 1280, height: 800 }),
})

export function tabletFrameSpec(platform = 'android') {
  return TABLET_FRAME_SPECS[platform] ?? TABLET_FRAME_SPECS.android
}

export function fitTabletFrame(windowWidth, windowHeight, platform = 'android') {
  const safeWidth = Math.max(0, windowWidth)
  const safeHeight = Math.max(0, windowHeight)
  const spec = tabletFrameSpec(platform)
  const scale = Math.min(safeWidth / spec.width, safeHeight / spec.height)

  return {
    width: spec.width * scale,
    height: spec.height * scale,
  }
}

// 창의 짧은 변이 이 값(dp) 이상이면 태블릿 화면으로 본다. (Android sw600dp와 같은 기준)
export const TABLET_MIN_SHORT_SIDE = 600

// 기기 종류가 아니라 지금 창 크기로 판단해야 iPad Split View·접이식 폰·웹 창 크기 변경에도 맞게 바뀐다.
export function formFactorFor(windowWidth, windowHeight) {
  return Math.min(windowWidth, windowHeight) >= TABLET_MIN_SHORT_SIDE ? 'tablet' : 'phone'
}
