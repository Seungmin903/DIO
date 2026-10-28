// 다이어리 편집 데이터의 공통 좌표계. 플랫폼이 달라도 저장 데이터와 내보내기 크기는 유지한다.
export const TABLET_WIDTH = 1280
export const TABLET_HEIGHT = 800
export const TABLET_ASPECT_RATIO = TABLET_WIDTH / TABLET_HEIGHT

// 디자인 검증에 사용하는 플랫폼별 기준 크기. 앱 바깥 프레임 비율을 제한하지 않는다.
export const TABLET_FRAME_SPECS = Object.freeze({
  ios: Object.freeze({ width: 1024, height: 768 }), // iPad 기준 4:3
  android: Object.freeze({ width: 1280, height: 800 }), // Android 태블릿 기준 16:10
  web: Object.freeze({ width: 1280, height: 800 }),
})

export function tabletFrameSpec(platform = 'android') {
  return TABLET_FRAME_SPECS[platform] ?? TABLET_FRAME_SPECS.android
}

// 안전 영역을 제외하고 측정한 창 전체를 쓴다. 속지 비율·좌표·배율 계산과는 별개다.
export function fitTabletFrame(windowWidth, windowHeight) {
  const safeWidth = Math.max(0, windowWidth)
  const safeHeight = Math.max(0, windowHeight)
  return {
    width: safeWidth,
    height: safeHeight,
  }
}

// 창의 짧은 변이 이 값(dp) 이상이면 태블릿 화면으로 본다. (Android sw600dp와 같은 기준)
export const TABLET_MIN_SHORT_SIDE = 600

// 기기 종류가 아니라 지금 창 크기로 판단해야 iPad Split View·접이식 폰·웹 창 크기 변경에도 맞게 바뀐다.
export function formFactorFor(windowWidth, windowHeight) {
  return Math.min(windowWidth, windowHeight) >= TABLET_MIN_SHORT_SIDE ? 'tablet' : 'phone'
}
