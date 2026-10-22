// 다이어리 편집 데이터의 공통 좌표계. 플랫폼이 달라도 저장 데이터와 내보내기 크기는 유지한다.
export const TABLET_WIDTH = 1280
export const TABLET_HEIGHT = 800
export const TABLET_ASPECT_RATIO = TABLET_WIDTH / TABLET_HEIGHT

// 홈·편집기 UI는 플랫폼별 안전 영역을 끝까지 사용한다.
// 기준값은 이전 저장 데이터와 문서에서 플랫폼 정책을 식별할 때만 유지한다.
export const TABLET_FRAME_SPECS = Object.freeze({
  ios: Object.freeze({ mode: 'window' }), // iPad·Split View·Stage Manager의 실제 안전 영역
  android: Object.freeze({ mode: 'window' }),
  web: Object.freeze({ mode: 'window' }),
})

export function tabletFrameSpec(platform = 'android') {
  return TABLET_FRAME_SPECS[platform] ?? TABLET_FRAME_SPECS.android
}

export function fitTabletFrame(windowWidth, windowHeight, platform = 'android') {
  const safeWidth = Math.max(0, windowWidth)
  const safeHeight = Math.max(0, windowHeight)
  tabletFrameSpec(platform)
  return { width: safeWidth, height: safeHeight }
}

// 창의 짧은 변이 이 값(dp) 이상이면 태블릿 화면으로 본다. (Android sw600dp와 같은 기준)
export const TABLET_MIN_SHORT_SIDE = 600

// 기기 종류가 아니라 지금 창 크기로 판단해야 iPad Split View·접이식 폰·웹 창 크기 변경에도 맞게 바뀐다.
export function formFactorFor(windowWidth, windowHeight) {
  return Math.min(windowWidth, windowHeight) >= TABLET_MIN_SHORT_SIDE ? 'tablet' : 'phone'
}
