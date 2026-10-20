// 이전 문서는 기존 논리 크기로 읽고, 저장된 요소 좌표는 변환하지 않는다.
export function pageSize(page) {
  const width = page?.canvasWidth ?? 1188
  const height = page?.canvasHeight ?? 840
  return { width, height }
}
