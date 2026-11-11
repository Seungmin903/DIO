import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/editor/components/canvas/Canvas.js', import.meta.url), 'utf8')
const endHandler = source.slice(source.indexOf('onEnd: ({ cancelled }) => {'), source.indexOf('\n  })', source.indexOf('onEnd: ({ cancelled }) => {')))

test('앨범 빈 칸 탭만 선택 가능 상태로 제한하고 일반 속지 입력 처리는 보존한다', () => {
  assert.match(endHandler, /if \(!start \|\| cancelled \|\| cropping \|\| start\.maxMove >= TAP_MOVE_PX\) return/)
  assert.match(endHandler, /const albumSlot = canSelect && !near && activeTool === 'select' && onAlbumPhoto/)
  assert.ok(endHandler.indexOf('packingCheckAction(') < endHandler.indexOf('if (!canSelect) return'))
  assert.ok(endHandler.indexOf('planner.editTap(') < endHandler.indexOf('if (!canSelect) return'))
  assert.match(source, /canSelect && activeTool === 'select' \? backgroundHandlers/)
})
