// 이전 문서는 기존 논리 크기로 읽고, 저장된 요소 좌표는 변환하지 않는다.
export function pageSize(page) {
  const width = page?.canvasWidth ?? 1188
  const height = page?.canvasHeight ?? 840
  return { width, height }
}

// 새 속지는 문서 방향을 따르고, 방향이 없던 문서만 현재 페이지 비율로 판단한다.
export function pageTemplateOrientation(doc, page) {
  if (doc?.orientation === 'portrait' || doc?.orientation === 'landscape') return doc.orientation
  const { width, height } = pageSize(page)
  return height > width ? 'portrait' : 'landscape'
}
