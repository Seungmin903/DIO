// 로딩된 이전 견본과 숨긴 새 견본을 함께 둬서 이미지 교체 중 빈 화면을 막는다.
export function pencilPreviewFrames(ready, next, failedUri = null) {
  // A failed current raster must not leave an older width/opacity preview on screen.
  if (next && failedUri === next.uri) return []
  return [ready && { image: ready, visible: true }, next && next.uri !== ready?.uri && { image: next, visible: false }].filter(Boolean)
}

export const isCurrentPencilPreviewEvent = (latestUri, eventUri) => latestUri === eventUri
export const pencilPreviewFallbackVisible = frames => !frames.some(frame => frame.visible)

export const pencilPreviewPosition = (image, box) => ({
  left: image.left + (box.w - image.boxWidth) / 2,
  top: image.top + (box.h - image.boxHeight) / 2,
})
