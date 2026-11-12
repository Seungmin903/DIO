// 앱 저장소와 분리된 사진 틀 검증 화면: 사진 보관함(불러오기 · 사진 틀) · 틀별 렌더링 · 빈 자리 + · 4칸 틀 옵션.
import { useEffect, useState } from 'react'
import { registerRootComponent } from 'expo'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import DecorDrawer from '../../src/editor/components/panels/DecorDrawer'
import MorePanel from '../../src/editor/components/panels/MorePanel'
import ObjectContent from '../../src/editor/components/canvas/ObjectView'
import SlotAddButtons from '../../src/editor/components/canvas/SlotAddButtons'
import FrameTextEditor from '../../src/editor/components/canvas/FrameTextEditor'
import ContextBar from '../../src/editor/components/canvas/ContextBar'
import PhotoCropper from '../../src/editor/components/panels/PhotoCropper'
import { createObjectFromDecor } from '../../src/editor/utils/objects'
import { stripCellBoxes } from '../../src/editor/utils/photoStrip'

// 원본 없이도 보이는 색 사진 (가로 4:3, 웹 캔버스로 만든 PNG)
const sample = (id, top, bottom) => {
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 300
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = top; ctx.fillRect(0, 0, 400, 180)
  ctx.fillStyle = bottom; ctx.fillRect(0, 180, 400, 120)
  ctx.fillStyle = '#FFF3B0'; ctx.beginPath(); ctx.arc(290, 90, 38, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#1F2026'; ctx.font = 'bold 72px sans-serif'; ctx.fillText(id.toUpperCase(), 30, 110)
  return { id, name: `샘플 ${id}`, imageWidth: 400, imageHeight: 300, src: canvas.toDataURL('image/png') }
}
const PHOTOS = [sample('a', '#CFE0F2', '#A9C79B'), sample('b', '#F6D6DC', '#E0A9B4'), sample('c', '#E7DCCB', '#C8A88C'), sample('d', '#D9E6D2', '#9DBE8F'), sample('e', '#DCD6F0', '#8C86B8')]

// [틀, x, y, 사진 넣기] — 빈 틀은 + 가 뜬다
const layout = [
  ['polaroid', 20, 20, true], ['film', 280, 20, true], ['stamp', 20, 300, false],
  ['ticketConcert', 280, 300, true], ['ticketCinema', 280, 470, true], ['ticketMatch', 640, 470, false], ['ticketBoarding', 640, 300, true],
  ['fourcut', 1010, 20, true], ['filmstrip', 20, 670, true],
]

// ?zoom= 로 캔버스 배율을 바꿔 본다 (기기처럼 소수 배율에서 틀 가장자리가 잘리지 않는지)
const ZOOM = Number(new URLSearchParams(window.location.search).get('zoom') ?? 1)

function Fixture() {
  const [objects, setObjects] = useState(() => layout.map(([frame, x, y, filled]) => {
    const item = !filled ? { kind: 'frame', frame }
      : frame === 'fourcut' ? { kind: 'photo', frame, photos: PHOTOS.slice(0, 3) }
      : frame === 'filmstrip' ? { kind: 'photo', frame, photos: PHOTOS.slice(1, 5) }
      : { kind: 'frame', frame }
    // 한 장 틀은 앱처럼 빈 틀을 붙인 뒤 사진을 채운다
    const media = filled && item.kind === 'frame' ? { src: PHOTOS[0].src, name: PHOTOS[0].name, imageWidth: 400, imageHeight: 300 } : {}
    const object = { ...createObjectFromDecor(item, { x: 0, y: 0 }), ...media }
    return { ...object, x, y }
  }))
  const [added, setAdded] = useState([])
  const [filled, setFilled] = useState([])
  const [cropCell, setCropCell] = useState(null)
  const [textEdit, setTextEdit] = useState(null) // { frame, line }: 그 틀의 인쇄 줄을 그 자리에서 고친다
  useEffect(() => { window.__photoFrameReview = { objects, added, filled }; window.__photoFrameCrop = setCropCell; window.__photoFrameText = setTextEdit; window.__photoFrameSet = setObjects }, [objects, added, filled])
  const strip = objects.find((o) => o.frame === 'fourcut')
  const dispatch = (action) => {
    const id = action.id ?? strip.id
    const patch = action.patch ?? action.patches?.[id]
    if (patch) setObjects((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  }
  const textTarget = textEdit && objects.find((o) => o.frame === textEdit.frame)
  return (
    <View style={{ padding: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 24, backgroundColor: '#CED9EE', minHeight: '100%' }}>
      <View testID="drawer" style={{ height: 860 }}>
        <DecorDrawer tab="widget" onAdd={(item) => setAdded((list) => [...list, item])} onToast={() => {}} onClose={() => {}} />
      </View>
      <View testID="stage" style={{ width: 1180, height: 800, position: 'relative', backgroundColor: '#FFFFFF' }}>
        {objects.map((o) => (
          <View key={o.id} testID={`frame-${o.frame}`} style={{ position: 'absolute', left: o.x * ZOOM, top: o.y * ZOOM, width: o.w * ZOOM, height: o.h * ZOOM }}>
            <ObjectContent object={o} zoom={ZOOM} />
          </View>
        ))}
        <SlotAddButtons objects={objects} zoom={ZOOM} onFill={(o, slot) => setFilled((list) => [...list, [o.frame, slot]])} />
        {textTarget && <FrameTextEditor key={`${textEdit.frame}-${textEdit.line}`} object={textTarget} line={textEdit.line} zoom={ZOOM} dispatch={dispatch} onClose={() => setTextEdit(null)} />}
      </View>
      {/* 요소를 고르면 뜨는 선택 바: 페이지 폭(barPage)이 좁을 때도 글자가 버튼 안에 맞는지 */}
      {[1040, 700, 520].map((barPage) => (
        <View key={barPage} testID={`bar-${barPage}`} style={{ width: barPage, height: 150, position: 'relative', backgroundColor: '#FFFFFF' }}>
          <ContextBar objects={[{ ...strip, x: barPage / 2 - 40, y: 80, w: 80, h: 60 }]} allObjects={objects} pageWidth={barPage} pageHeight={150} zoom={1}
            dispatch={() => {}} moreOpen={false} onToggleMore={() => {}} onCrop={() => {}} onFillCells={() => {}} onToast={() => {}} />
        </View>
      ))}
      <View testID="options" style={{ maxHeight: 860 }}>
        <MorePanel objects={[strip]} dispatch={dispatch} onReplacePhoto={() => {}} onReplaceCell={() => {}} onCropCell={(_, index) => setCropCell(index)} onClose={() => {}} />
      </View>
      {cropCell != null && strip.cells[cropCell] && (() => {
        const box = stripCellBoxes(strip)[cropCell]
        const photo = { ...strip.cells[cropCell], id: 'cell', x: 0, y: 0, w: box.width, h: box.height, frame: 'shape', shape: 'rect' }
        return <PhotoCropper photo={photo} fixedAspect={box.width / box.height} title={`${cropCell + 1}번 칸 자르기`} onCancel={() => setCropCell(null)}
          onApply={(patch) => { dispatch({ patch: { cells: strip.cells.map((c, i) => (i === cropCell ? { ...c, crop: patch.crop } : c)) } }); setCropCell(null) }} />
      })()}
    </View>
  )
}
// 자르기 창(CropViewport)이 안전 영역을 읽는다. 앱에서는 최상위가 감싼다.
registerRootComponent(() => <SafeAreaProvider><Fixture /></SafeAreaProvider>)
