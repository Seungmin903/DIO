/** 네이티브 surface 크기와 밀도로 요청 픽셀 대비 확대 여부를 추정한다. GPU 실측값은 아니다. */
export function pageImageQuality(snapshot, { platform, scale = 1, pixelRatio = 1 }) {
  const renderedWidth = snapshot.width * scale, renderedHeight = snapshot.height * scale
  const physicalWidth = platform === 'web' ? snapshot.pixelWidth : Math.floor(renderedWidth * pixelRatio)
  const physicalHeight = platform === 'web' ? snapshot.pixelHeight : Math.floor(renderedHeight * pixelRatio)
  return { platform, scale, pixelRatio, renderedWidth, renderedHeight, physicalWidth, physicalHeight,
    requestedWidth: snapshot.pixelWidth, requestedHeight: snapshot.pixelHeight,
    upscaled: snapshot.pixelWidth > physicalWidth || snapshot.pixelHeight > physicalHeight }
}
