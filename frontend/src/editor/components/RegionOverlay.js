import { useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors } from '../../shared/theme'
import { usePan } from '../hooks/usePan'
import { resizeRegion, validRegion } from '../utils/regionGeometry.js'

const corners = { nw: '왼쪽 위', ne: '오른쪽 위', sw: '왼쪽 아래', se: '오른쪽 아래' }

export default function RegionOverlay({ region, draft, zoom, pageSize, ratio, onDraft, onChange }) {
  const selection = draft ?? region
  const x = selection.x * zoom, y = selection.y * zoom
  const width = selection.width * zoom, height = selection.height * zoom
  return <View testID="export-region-overlay" accessibilityLabel="내보내기 영역 선택판" pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    <View pointerEvents="none" style={[styles.mask, { left: 0, top: 0, right: 0, height: y }]} />
    <View pointerEvents="none" style={[styles.mask, { left: 0, top: y + height, right: 0, bottom: 0 }]} />
    <View pointerEvents="none" style={[styles.mask, { left: 0, top: y, width: x, height }]} />
    <View pointerEvents="none" style={[styles.mask, { left: x + width, top: y, right: 0, height }]} />
    <View testID="export-region-frame" pointerEvents="none" style={[styles.frame, { left: x, top: y, width, height }]} />
    {Object.keys(corners).map(corner => <RegionHandle key={corner} corner={corner} region={region} selection={selection}
      zoom={zoom} pageSize={pageSize} ratio={ratio} onDraft={onDraft} onChange={onChange} />)}
  </View>
}

function RegionHandle({ corner, region, selection, zoom, pageSize, ratio, onDraft, onChange }) {
  const drag = useRef(null)
  const pan = usePan({
    onStart: () => { drag.current = { region, zoom, next: null } },
    onMove: (dx, dy) => {
      const start = drag.current
      if (!start) return
      start.next = resizeRegion(start.region, corner, dx / start.zoom, dy / start.zoom, pageSize, ratio)
      onDraft(start.next)
    },
    onEnd: ({ cancelled, moved }) => {
      const start = drag.current
      drag.current = null
      if (!cancelled && moved && validRegion(start?.next, pageSize, ratio)) onChange(start.next)
      else onDraft(null)
    },
  })
  // 작은 선택에서는 인접 모서리의 터치 범위가 겹치지 않게 한다.
  const width = Math.min(44, selection.width * zoom)
  const height = Math.min(44, selection.height * zoom)
  const size = Math.min(12, width, height)
  return <View testID={`region-handle-${corner}`} accessibilityLabel={`${corners[corner]} 영역 크기 조절`} {...pan}
    style={[styles.handle, {
      left: (selection.x + (corner.includes('w') ? 0 : selection.width)) * zoom - width / 2,
      top: (selection.y + (corner.includes('n') ? 0 : selection.height)) * zoom - height / 2,
      width, height,
    }]}><View pointerEvents="none" style={[styles.dot, { width: size, height: size }]} /></View>
}

const styles = StyleSheet.create({
  mask: { position: 'absolute', backgroundColor: colors.overlay },
  frame: { position: 'absolute', borderWidth: 2, borderColor: colors.primary },
  handle: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  dot: { borderRadius: 6, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary },
})
