// DIO MVP1의 기준 화면. 모든 화면은 이 비율 안에서 가장 크게 표시한다.
export const TABLET_WIDTH = 1280
export const TABLET_HEIGHT = 800
export const TABLET_ASPECT_RATIO = TABLET_WIDTH / TABLET_HEIGHT

export function fitTabletFrame(windowWidth, windowHeight) {
  const safeWidth = Math.max(0, windowWidth)
  const safeHeight = Math.max(0, windowHeight)
  const scale = Math.min(safeWidth / TABLET_WIDTH, safeHeight / TABLET_HEIGHT)

  return {
    width: TABLET_WIDTH * scale,
    height: TABLET_HEIGHT * scale,
  }
}
