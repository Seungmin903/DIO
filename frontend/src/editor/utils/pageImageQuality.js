/** 네이티브 surface 크기와 밀도로 요청 픽셀 대비 확대 여부를 추정한다. GPU 실측값은 아니다. */
export function pageImageQuality(snapshot, { platform, scale = 1, pixelRatio = 1 }) {
  const renderedWidth = snapshot.width * scale, renderedHeight = snapshot.height * scale
  const physicalWidth = platform === 'web' ? snapshot.pixelWidth : Math.floor(renderedWidth * pixelRatio)
  const physicalHeight = platform === 'web' ? snapshot.pixelHeight : Math.floor(renderedHeight * pixelRatio)
  return { platform, scale, pixelRatio, renderedWidth, renderedHeight, physicalWidth, physicalHeight,
    requestedWidth: snapshot.pixelWidth, requestedHeight: snapshot.pixelHeight,
    upscaled: snapshot.pixelWidth > physicalWidth || snapshot.pixelHeight > physicalHeight }
}

/** 추정치 경고이며 실제 기기 해상도 보장이나 생성 차단을 뜻하지 않는다. */
export function pngQualityWarning(diagnostics) {
  if (!diagnostics?.upscaled || diagnostics.platform === 'web') return null
  return `이 기기에서는 약 ${diagnostics.physicalWidth} × ${diagnostics.physicalHeight}px로 그린 이미지를 ${diagnostics.requestedWidth} × ${diagnostics.requestedHeight}px로 확대해 저장해요. 글씨나 사진이 흐릴 수 있어요. 더 넓은 영역을 선택하거나 웹에서 내보내면 화질을 개선할 수 있어요.`
}
