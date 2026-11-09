import { useEffect, useId, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg'
import { packingLayout } from '../../templates/packingLayout.js'
import { packingColorAction } from '../../templates/packingEditing.js'
import { pageSize } from '../../utils/pageGeometry.js'
import { usePan } from '../../hooks/usePan'

const regions = [['case-0', '왼쪽 틀'], ['interior-0', '왼쪽 안'], ['case-1', '오른쪽 틀'], ['interior-1', '오른쪽 안']]
const rounded = ({ x, y, width: w, height: h, rx: r }) => `M${x+r} ${y}H${x+w-r}A${r} ${r} 0 0 1 ${x+w} ${y+r}V${y+h-r}A${r} ${r} 0 0 1 ${x+w-r} ${y+h}H${x+r}A${r} ${r} 0 0 1 ${x} ${y+h-r}V${y+r}A${r} ${r} 0 0 1 ${x+r} ${y}Z`

// 색상은 기존 캔버스 요소로 저장해 서버·기기 복원 경로에서 보존한다.
export function PackingColorLayer({ page, zoom }) {
  const layout = packingLayout(page.backgroundAssetId)
  if (!layout) return null
  const colors = Object.fromEntries(page.objects.filter(o => o.packingColorRegion && !o.hidden).map(o => [o.packingColorRegion, o.fill]))
  const { width, height } = pageSize(page)
  return <Svg pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }} width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`}>
    <G transform={`translate(${layout.origin.x} ${layout.origin.y}) scale(${layout.scaleX ?? 1} ${layout.scaleY ?? 1})`}>
      {layout.cases.map((outer, i) => colors[`case-${i}`] && <Path key={`case-${i}`} d={`${rounded(outer)} ${rounded(layout.interiors[i])}`} fill={colors[`case-${i}`]} fillRule="evenodd" />)}
      {layout.interiors.map((box, i) => colors[`interior-${i}`] && <Rect key={`inside-${i}`} {...box} fill={colors[`interior-${i}`]} />)}
    </G>
  </Svg>
}

export function PackingColorControls({ page, zoom, color, dispatch, onOpenDrawer }) {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [position, setPosition] = useState(null)
  const startRef = useRef(null)
  const { width, height } = pageSize(page)
  const pageWidth = width * zoom, pageHeight = height * zoom
  const clamp = (value, max) => Math.max(0, Math.min(value, Math.max(0, max)))
  const initial = { x: Math.max(0, pageWidth - 164), y: Math.max(0, pageHeight - 120) }
  const current = position ?? initial
  const pan = usePan({
    onStart: () => { startRef.current = current; setOpen(false) },
    onMove: (dx, dy) => {
      const start = startRef.current ?? initial
      setPosition({ x: clamp(start.x + dx, pageWidth - 148), y: clamp(start.y + dy, pageHeight - 44) })
    },
    onEnd: () => { startRef.current = null },
  })
  useEffect(() => { setPosition(null); setOpen(false); setCollapsed(false) }, [page.id])
  if (!packingLayout(page.backgroundAssetId)) return null
  const setRegion = region => {
    const action = packingColorAction(region, color, page.objects)
    if (action) dispatch(action)
  }
  const top = current.y < Math.min(200, pageHeight / 2)
  return <View pointerEvents="box-none" style={{ position: 'absolute', left: clamp(current.x, pageWidth - 148), top: clamp(current.y, pageHeight - 44), zIndex: 10 }}>
    {collapsed ? <Pressable accessibilityRole="button" accessibilityLabel="캐리어 꾸미기 다시 열기" onPress={() => setCollapsed(false)} style={{ backgroundColor: '#353047', borderRadius: 18, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 20 }}>+</Text></Pressable> : <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#353047', borderRadius: 22, borderWidth: 1, borderColor: '#4c4560', elevation: 3 }}>
      <View {...pan} accessibilityLabel="캐리어 꾸미기 이동" style={{ paddingHorizontal: 10, paddingVertical: 10 }}><Text style={{ color: '#ded8ef', fontSize: 17, lineHeight: 20 }}>⠿</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="캐리어 꾸미기" onPress={() => setOpen(!open)} style={{ paddingVertical: 11, paddingRight: 16 }}><Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>캐리어 꾸미기</Text></Pressable>
    </View>}
    {open && !collapsed && <View style={{ position: 'absolute', ...(top ? { top: 50 } : { bottom: 50 }), right: current.x < 110 ? undefined : 0, left: current.x < 110 ? 0 : undefined, width: Math.min(248, pageWidth), backgroundColor: '#ffffff', borderColor: '#e8e5f0', borderWidth: 1, borderRadius: 16, padding: 14, elevation: 5, shadowColor: '#252037', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}><Text style={{ fontWeight: '700', fontSize: 15, color: '#302a3d' }}>캐리어 꾸미기</Text><Pressable accessibilityRole="button" accessibilityLabel="캐리어 꾸미기 숨기기" onPress={() => { setOpen(false); setCollapsed(true) }}><Text style={{ color: '#706a7d', fontSize: 12, padding: 4 }}>숨기기</Text></Pressable></View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="캐리어에 넣을 스티커 고르기" onPress={() => { setOpen(false); onOpenDrawer?.('sticker') }} style={{ flex: 1, backgroundColor: '#f2eff9', borderRadius: 10, padding: 10, alignItems: 'center' }}><Text style={{ color: '#554b73', fontWeight: '600', fontSize: 12 }}>스티커</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="캐리어에 넣을 사진 고르기" onPress={() => { setOpen(false); onOpenDrawer?.('photo') }} style={{ flex: 1, backgroundColor: '#f2eff9', borderRadius: 10, padding: 10, alignItems: 'center' }}><Text style={{ color: '#554b73', fontWeight: '600', fontSize: 12 }}>사진</Text></Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 7 }}><View style={{ width: 13, height: 13, backgroundColor: color, borderRadius: 7, borderWidth: 1, borderColor: '#e4e1e8' }} /><Text style={{ color: '#615b6b', fontSize: 12, fontWeight: '600' }}>선택한 펜 색으로 칠하기</Text></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{regions.map(([id, label]) => <Pressable key={id} accessibilityRole="button" accessibilityLabel={`캐리어 ${label} 색칠`} onPress={() => setRegion(id)} style={{ width: '47%', paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: '#e8e5ee', borderRadius: 9 }}><Text style={{ fontSize: 12, color: '#45404d' }}>{label}</Text></Pressable>)}</View>
    </View>}
  </View>
}

// 수납 요소 위에는 테두리, 고정 끈과 그물만 다시 그린다.
export function PackingFrontLayer({ page, zoom }) {
  const clipId = `packing-mesh-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const layout = packingLayout(page.backgroundAssetId)
  if (!layout) return null
  const { width, height } = pageSize(page)
  const portrait = page.backgroundAssetId.endsWith('portrait')
  const beltY = portrait ? 198.45 : 258.3
  const beltRight = portrait ? 294 : 242
  const buckleX = portrait ? 136.5 : 110.5
  const left = layout.interiors[0], cx = left.x + left.width / 2, cy = left.y + left.height / 2
  const strapPath = `M${left.x + 10} ${left.y + 10} L${cx} ${cy - 30} L${cx} ${cy + 30} L${left.x + 10} ${left.y + left.height - 10} M${left.x + left.width - 10} ${left.y + 10} L${cx} ${cy - 30} M${cx} ${cy + 30} L${left.x + left.width - 10} ${left.y + left.height - 10}`
  const lines = Array.from({ length: 110 }, (_, i) => {
    const x = i * 18 - 600
    return `M${x} 0l600 600 M${x} 600l600 -600`
  }).join(' ')
  return <Svg pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }} width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`}>
    <Defs><ClipPath id={clipId}><Path d={layout.mesh} /></ClipPath></Defs>
    <G transform={`translate(${layout.origin.x} ${layout.origin.y}) scale(${layout.scaleX ?? 1} ${layout.scaleY ?? 1})`}>
      {layout.cases.map((box, i) => <Rect key={`outer-${i}`} {...box} fill="none" stroke="#666666" strokeWidth={layout.outlineWidth ?? 1.8} />)}
      {layout.interiors.map((box, i) => <Rect key={i} {...box} fill="none" stroke="#666666" strokeWidth={layout.outlineWidth ?? 1.2} />)}
      {layout.detailed ? <>
        {layout.interiors.map((box, i) => <Rect key={`depth-${i}`} x={box.x + 5} y={box.y + 5} width={box.width - 10} height={box.height - 10} rx={Math.max(1, box.rx - 4)} fill="none" stroke="#d1d2d6" strokeWidth="5" />)}
        {layout.buckleV2 ? <>
          <Path d={strapPath} fill="none" stroke="#74767b" strokeWidth="14" strokeLinejoin="round" />
          <Path d={strapPath} fill="none" stroke="#e2e3e5" strokeWidth="10" strokeLinejoin="round" />
          <Rect x={cx - 8} y={cy - 10} width="16" height="20" rx="3" fill="#777a80" stroke="#595c61" strokeWidth="1.3" />
          <Path d={`M${cx-5} ${cy-3}H${cx+5} M${cx-5} ${cy+4}H${cx+5}`} stroke="#f0f0f1" strokeWidth="1.5" />
        </> : <>
        <Path d={`M${layout.interiors[0].x + 10} ${layout.interiors[0].y + 10} L${layout.interiors[0].x + layout.interiors[0].width - 10} ${layout.interiors[0].y + layout.interiors[0].height - 10} M${layout.interiors[0].x + layout.interiors[0].width - 10} ${layout.interiors[0].y + 10} L${layout.interiors[0].x + 10} ${layout.interiors[0].y + layout.interiors[0].height - 10}`} fill="none" stroke="#74767b" strokeWidth="13" />
        <Path d={`M${layout.interiors[0].x + 10} ${layout.interiors[0].y + 10} L${layout.interiors[0].x + layout.interiors[0].width - 10} ${layout.interiors[0].y + layout.interiors[0].height - 10} M${layout.interiors[0].x + layout.interiors[0].width - 10} ${layout.interiors[0].y + 10} L${layout.interiors[0].x + 10} ${layout.interiors[0].y + layout.interiors[0].height - 10}`} fill="none" stroke="#e2e3e5" strokeWidth="9" />
        <Rect x={layout.interiors[0].x + layout.interiors[0].width / 2 - 13} y={layout.interiors[0].y + layout.interiors[0].height / 2 - 12} width="26" height="24" rx="5" fill="#ffffff" stroke="#666666" strokeWidth="1.5" />
        <Rect x={layout.interiors[0].x + layout.interiors[0].width / 2 - 6} y={layout.interiors[0].y + layout.interiors[0].height / 2 - 5} width="12" height="10" rx="2" fill="none" stroke="#888888" strokeWidth="1" />
        </>}
      </> : <>
      <Path d={`M16 ${beltY}H${beltRight}`} fill="none" stroke="#666666" strokeWidth="21" />
      <Path d={`M16 ${beltY}H${beltRight}`} fill="none" stroke="#e8e9eb" strokeWidth="18" />
      <Rect x={buckleX} y={beltY - 17} width="36" height="34" rx="7" fill="#ffffff" stroke="#666666" strokeWidth="1.8" />
      <Rect x={buckleX + 9} y={beltY - 7} width="18" height="14" rx="3" fill="#ffffff" stroke="#666666" strokeWidth="1.8" />
      </>}
      <Path d={lines} stroke="#bfc1c4" strokeWidth="0.8" fill="none" clipPath={`url(#${clipId})`} />
      {layout.detailed && <>
        <Rect x={layout.interiors[1].x + 5} y={layout.interiors[1].y + 5} width={layout.interiors[1].width - 10} height={layout.interiors[1].height - 10} rx={Math.max(1, layout.interiors[1].rx - 4)} fill="none" stroke="#92949a" strokeWidth="2" strokeDasharray="3 2" />
        {layout.buckleV2 ? <G transform={`translate(${layout.interiors[1].x + layout.interiors[1].width - 22} ${layout.interiors[1].y + 13})`}>
          <Rect x="0" y="0" width="11" height="8" rx="3" fill="#777a80" stroke="#56595d" strokeWidth="1" />
          <Path d="M2 6 L9 6 L12 29 Q12 34 5.5 34 Q-1 34 -1 29 Z" fill="#eceef0" stroke="#707378" strokeWidth="1.3" />
          <Circle cx="5.5" cy="27" r="3.2" fill="#7c8084" stroke="#5f6367" strokeWidth="0.8" />
          <Path d="M3 9 L4 21" stroke="#ffffff" strokeWidth="1" />
        </G> : <Rect x={layout.interiors[1].x + layout.interiors[1].width - 19} y={layout.interiors[1].y + 12} width="10" height="20" rx="3" fill="#fafafa" stroke="#777777" strokeWidth="1.2" />}
      </>}
    </G>
  </Svg>
}
