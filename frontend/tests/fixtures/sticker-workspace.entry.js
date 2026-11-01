// Browser-only UI fixture. Synthetic candidates never enter the production app.
import { registerRootComponent } from 'expo'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import StickerSplitModal from '../../src/editor/components/panels/StickerSplitModal'
import { stickerSplit } from '../../src/editor/services/stickerSplit'

const canvas = document.createElement('canvas')
canvas.width = 800; canvas.height = 1000
const context = canvas.getContext('2d')
context.fillStyle = '#FFFFFF'; context.fillRect(0, 0, 800, 1000)
const parts = Array.from({ length: 32 }, (_, index) => {
  const x = 24 + (index % 4) * 196, y = 24 + Math.floor(index / 4) * 122
  const width = 60 + (index % 4) * 24, height = 56 + (index % 3) * 12
  context.fillStyle = ['#818AC3', '#FEF0BF', '#0B1766', '#ABB1D8'][index % 4]
  context.fillRect(x, y, width, height)
  const part = document.createElement('canvas'); part.width = width; part.height = height
  part.getContext('2d').drawImage(canvas, x, y, width, height, 0, 0, width, height)
  return { id: `p${index}`, uri: part.toDataURL('image/png'), x, y, width, height, area: width * height }
})
const source = { uri: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
let id = 0
Object.assign(stickerSplit, {
  available: true, selectionEditing: true, completeRegions: true,
  async pick() { return source },
  analyze() { return { id: `analysis${++id}`, promise: Promise.resolve({ parts }) } },
  groupEdges(_parts, pixels) { return { id: `edges${++id}`, promise: Promise.resolve(pixels > 20 ? [['p0', 'p1']] : []) } },
  brushHits(candidates, points, radius) {
    // All fixture objects are opaque rectangles; keep this deterministic and local.
    const hits = candidates.filter(part => points.some(point => {
      const x = Math.max(part.x, Math.min(part.x + part.width, point.x))
      const y = Math.max(part.y, Math.min(part.y + part.height, point.y))
      return Math.hypot(point.x - x, point.y - y) <= radius
    })).map(part => part.id)
    return { id: `brush${++id}`, promise: Promise.resolve(hits) }
  },
})
function Fixture() {
  return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: innerWidth, height: innerHeight }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
    <StickerSplitModal initialName="검증용 스티커" onClose={() => {}} onSave={() => {}} />
  </SafeAreaProvider>
}
registerRootComponent(Fixture)
