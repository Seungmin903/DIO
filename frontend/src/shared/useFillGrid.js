import { useCallback, useState } from 'react'

/**
 * 같은 크기 칸을 줄바꿈하는 격자가 좌우 끝을 꽉 채우게 한다. 칸 폭을 고정하면 창 폭이 바뀔 때 오른쪽에 한 칸 가까이 빈다.
 * 격자 View 에 onLayout 을 달면 잰 폭에 들어가는 만큼 열을 두고(cell 이상), 남는 폭은 칸에 고루 나눠 준다.
 * 칸 크기를 바꿀 수 없을 때(고정 크기 썸네일)는 spreadGap 을 columnGap 으로 쓰면 칸은 그대로 두고 사이를 넓혀 끝을 맞춘다.
 * 재기 전에는 cell 그대로 그린다(첫 화면이 비지 않게).
 * cell: 칸 최소 폭, gap: 칸 사이, minColumns · maxColumns: 열 수 범위
 */
export default function useFillGrid({ cell, gap, minColumns = 1, maxColumns = Infinity }) {
  const [width, setWidth] = useState(0)
  const onLayout = useCallback((event) => {
    const next = event.nativeEvent.layout.width
    setWidth((prev) => (Math.abs(prev - next) < 0.5 ? prev : next))
  }, [])
  if (!width) return { onLayout, columns: minColumns, cellWidth: cell, spreadGap: gap }
  const columns = Math.max(minColumns, Math.min(maxColumns, Math.floor((width + gap) / (cell + gap))))
  // 잰 폭은 픽셀에 맞춰 반올림된 값이라 실제 폭보다 클 수 있다: 0.5 덜고 내림해 마지막 칸이 다음 줄로 넘어가지 않게 한다
  const cellWidth = Math.floor(((width - 0.5 - gap * (columns - 1)) / columns) * 100) / 100
  // 열 수가 고정(minColumns)이라 폭이 모자라면 음수가 되므로 0 아래로 내리지 않는다
  const spreadGap = columns > 1 ? Math.max(0, Math.floor(((width - 0.5 - cell * columns) / (columns - 1)) * 100) / 100) : gap
  return { onLayout, columns, cellWidth, spreadGap }
}
