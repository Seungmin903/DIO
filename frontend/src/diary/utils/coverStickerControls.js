// 실제 표지 조작과 테스트가 함께 사용하는 배치 값.
export const HANDLE = 18
export const MARGIN = 40
export const ROTATE_SNAP_DEG = 4.5
export const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
export const BAR = { width: 92, height: 40 }
export { ROTATE_OFFSET } from '../../editor/utils/selectionMetrics.js'

// 그림의 순서는 건드리지 않고 선택된 조작 영역만 앞으로 올린다.
export function stickerControlLayer(selected) {
  return { pointerEvents: 'box-none', collapsable: false, style: { zIndex: selected ? 1 : 0 } }
}
