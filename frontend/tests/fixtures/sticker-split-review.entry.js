// 웹에서 스티커 시트 분리 화면을 눈으로 확인하는 개발용 입구: 처리 모듈 대신 가짜 분리 엔진을 끼운다(화면 검토 전용).
import { registerRootComponent } from 'expo'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import StickerSplitModal from '../../src/editor/components/panels/StickerSplitModal'
import { stickerSplit } from '../../src/editor/services/stickerSplit'

const W = 900, H = 600
const SHAPES = [['e', 60, 60, 200, 200, '#F0AAAA'], ['r', 340, 70, 180, 180, '#A0BEE6'], ['t', 640, 70, 200, 180, '#FAD778'],
  ['e', 90, 340, 160, 160, '#AAD7B4'], ['r', 360, 340, 180, 160, '#D2B4E6'], ['e', 650, 330, 180, 180, '#FABE8C']]
function draw(ctx, [kind, x, y, w, h, color], dx = 0, dy = 0) {
  ctx.fillStyle = color; ctx.beginPath()
  if (kind === 'e') ctx.ellipse(x - dx + w / 2, y - dy + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
  else if (kind === 'r') ctx.roundRect(x - dx, y - dy, w, h, 18)
  else { ctx.moveTo(x - dx, y - dy + h); ctx.lineTo(x - dx + w / 2, y - dy); ctx.lineTo(x - dx + w, y - dy + h); ctx.closePath() }
  ctx.fill()
}
function canvasUrl(width, height, paint, bg) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d'); if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height) }
  paint(ctx); return canvas.toDataURL('image/png')
}
const sheet = canvasUrl(W, H, ctx => SHAPES.forEach(shape => draw(ctx, shape)), '#FFFFFF')
const parts = SHAPES.map((shape, index) => {
  const [, x, y, w, h] = shape
  return { id: `part-${index}`, x, y, width: w, height: h, area: w * h, uri: canvasUrl(w, h, ctx => draw(ctx, shape, x, y)) }
})
Object.assign(stickerSplit, {
  available: true,
  async pick() { return { uri: sheet, width: W, height: H, name: '스티커 시트' } },
  analyze() { return { id: `job-${Math.random()}`, promise: new Promise(resolve => setTimeout(() => resolve({ parts }), 400)) } },
  async merge() { throw new Error('검토용 입구에서는 저장하지 않아요.') },
})
function Fixture() {
  return <SafeAreaProvider><View style={{ flex: 1 }}>
    <StickerSplitModal folder={{ id: 'f', name: '내 스티커' }} onSave={async () => {}} onClose={() => {}} />
  </View></SafeAreaProvider>
}
registerRootComponent(Fixture)
