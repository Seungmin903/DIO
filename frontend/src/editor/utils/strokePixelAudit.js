// source-over 합성의 알파는 개별 획 알파보다 작아질 수 없다. 겹친 획도 비교 가능하다.
export function compareStrokeAlpha(reference, combined, tolerance = 8) {
  if (reference.length !== combined.length) throw Error('Raster audit dimensions differ')
  let expectedPixels = 0, missingPixels = 0
  for (let i = 3; i < reference.length; i += 4) {
    if (reference[i] < 16) continue
    expectedPixels++
    if (combined[i] + tolerance < reference[i]) missingPixels++
  }
  return { expectedPixels, missingPixels }
}
