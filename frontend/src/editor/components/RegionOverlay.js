import { useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors } from '../../shared/theme'
import { usePan } from '../hooks/usePan'
import { finishRegionDrag, moveRegion, regionFromDrag, resizeRegion } from '../utils/regionGeometry.js'
export default function RegionOverlay({
  region,
  onChange,
  zoom,
  pageSize,
  ratio,
  drawing,
  panning = false,
  onDrawEnd
}) {
  const drag = useRef(null),
    previous = useRef(null),
    draft = useRef(null)
  const handlers = usePan({
    disabled: !drawing || panning,
    onStart: event => {
      previous.current = region
      draft.current = region
      drag.current = {
        x: event.locationX / zoom,
        y: event.locationY / zoom
      }
    },
    onMove: (dx, dy) => {
      if (drag.current) {
        draft.current = regionFromDrag(drag.current, {
          x: drag.current.x + dx / zoom,
          y: drag.current.y + dy / zoom
        }, pageSize, ratio)
        onChange(draft.current)
      }
    },
    onEnd: ({
      cancelled,
      moved
    }) => {
      onChange(finishRegionDrag(previous.current, draft.current, {
        cancelled,
        moved,
        page: pageSize,
        ratio
      }))
      drag.current = null
      onDrawEnd?.()
    }
  })
  const r = {
    x: region.x * zoom,
    y: region.y * zoom,
    width: region.width * zoom,
    height: region.height * zoom
  }
  return <View testID="export-region-overlay" accessibilityLabel="내보내기 영역 선택판" pointerEvents={panning ? 'none' : 'auto'} style={StyleSheet.absoluteFill} {...handlers}>
    <View pointerEvents="none" style={[styles.mask, {
      left: 0,
      top: 0,
      right: 0,
      height: r.y
    }]} />
    <View pointerEvents="none" style={[styles.mask, {
      left: 0,
      top: r.y + r.height,
      right: 0,
      bottom: 0
    }]} />
    <View pointerEvents="none" style={[styles.mask, {
      left: 0,
      top: r.y,
      width: r.x,
      height: r.height
    }]} />
    <View pointerEvents="none" style={[styles.mask, {
      left: r.x + r.width,
      top: r.y,
      right: 0,
      height: r.height
    }]} />
    {!drawing && <RegionMove region={region} zoom={zoom} pageSize={pageSize} onChange={onChange} />}
    {!drawing && ['nw', 'ne', 'sw', 'se'].map(corner => <RegionHandle key={corner} corner={corner} region={region} zoom={zoom} pageSize={pageSize} ratio={ratio} onChange={onChange} />)}
  </View>
}
function RegionMove({
  region,
  zoom,
  pageSize,
  onChange
}) {
  const start = useRef(null)
  const pan = usePan({
    onStart: () => {
      start.current = region
    },
    onMove: (dx, dy) => onChange(moveRegion(start.current, dx / zoom, dy / zoom, pageSize)),
    onEnd: ({
      cancelled
    }) => {
      if (cancelled) onChange(start.current)
    }
  })
  return <View testID="export-region-move" accessibilityLabel="선택 영역 이동" {...pan} style={{
    position: 'absolute',
    left: region.x * zoom,
    top: region.y * zoom,
    width: region.width * zoom,
    height: region.height * zoom,
    borderWidth: 2,
    borderColor: colors.primary
  }} />
}
function RegionHandle({
  corner,
  region,
  zoom,
  pageSize,
  ratio,
  onChange
}) {
  const start = useRef(null)
  const pan = usePan({
    onStart: () => {
      start.current = region
    },
    onMove: (dx, dy) => onChange(resizeRegion(start.current, corner, dx / zoom, dy / zoom, pageSize, ratio)),
    onEnd: ({
      cancelled
    }) => {
      if (cancelled) onChange(start.current)
    }
  })
  return <View testID={`region-handle-${corner}`} accessibilityLabel={`${corner} 영역 크기 조절`} {...pan} style={{
    position: 'absolute',
    left: (region.x + (corner.includes('w') ? 0 : region.width)) * zoom - 22,
    top: (region.y + (corner.includes('n') ? 0 : region.height)) * zoom - 22,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  }}><View pointerEvents="none" style={styles.dot} /></View>
}
const styles = StyleSheet.create({
  mask: {
    position: 'absolute',
    backgroundColor: colors.overlay
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary
  }
})
