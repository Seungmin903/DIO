import { PixelRatio } from 'react-native'

// 미리보기 그래픽 규칙(2026-11-02): 무늬(SVG Pattern)를 줄여 그릴 때 무늬 한 칸이 소수점 픽셀이 되면
// 칸 이음매에 가는 줄이 생기고 사선 · 줄무늬가 칸 경계에서 어긋난다(안드로이드에서 더 심하다).
// 무늬 칸 크기는 모두 정수 단위라, 배율 × 기기 픽셀 비율이 정수가 되게 맞추면 어떤 무늬든 칸이 기기 픽셀에 딱 맞는다.

/** 무늬 배율을 기기 픽셀 단위로 맞춘다(가장 가까운 1/픽셀비율 배수, 최소 한 칸). */
export function snapScale(scale) {
  const ratio = PixelRatio.get()
  return Math.max(1, Math.round(scale * ratio)) / ratio
}

/** 길이 · 자리를 기기 픽셀에 맞춘다. */
export function snapToPixel(value) {
  const ratio = PixelRatio.get()
  return Math.round(value * ratio) / ratio
}

/** 같은 간격으로 반복되는 선 · 점(메모지 줄 · 모눈)을 줄여 그릴 때: 간격(step) × 배율이 기기 픽셀 정수가 되게 배율을 맞춘다. 줄마다 진하기가 달라지지 않는다. */
export function snapStepScale(scale, step) {
  const ratio = PixelRatio.get()
  return Math.max(1, Math.round(step * scale * ratio)) / ratio / step
}

/** 줄여 그린 선이 기기 픽셀 한 칸보다 가늘어져 흐려지거나 사라지지 않게 하는 최소 굵기(그림 좌표 단위). */
export function hairline(scale) {
  return 1 / (scale * PixelRatio.get())
}
