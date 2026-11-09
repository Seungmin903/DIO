import test from 'node:test'
import assert from 'node:assert/strict'
import { packingBoxes, packingCheckAction, packingCheckPath, packingPenAction } from '../src/editor/templates/packingChecks.js'
import { encodeElement, decodeElement } from '../src/collaboration/canvasElements.js'

test('양방향 32개 체크박스를 선택하고 서버 요소 복원 후 해제한다', () => {
  for (const direction of ['portrait', 'landscape']) {
    const asset = `remote-packing-list-${direction}`
    const boxes = packingBoxes(asset)
    assert.equal(boxes.length, 32)
    boxes.forEach(({ x, y }, index) => {
      const action = packingCheckAction(asset, { x: x + 5, y: y + 5 }, [])
      assert.equal(action.type, 'addObjects')
      const mark = action.objects[0]
      assert.equal(mark.packingCheck, index)
      const encoded = encodeElement(mark)
      const restored = decodeElement({ ...encoded, version: 1 })
      assert.deepEqual(packingCheckAction(asset, { x: x + 5, y: y + 5 }, [restored]), { type: 'removeObjects', ids: [mark.id] })
    })
  }
})

test('다른 속지와 체크박스 바깥은 건드리지 않는다', () => {
  assert.equal(packingCheckAction('remote-other-portrait', { x: 45, y: 602 }, []), null)
  assert.equal(packingCheckAction('remote-packing-list-portrait', { x: 100, y: 602 }, []), null)
})

test('펜으로 체크하면 선택한 색과 상자 밖까지 이어지는 표시를 저장한다', () => {
  const asset = 'remote-packing-list-portrait'
  const points = [{ x: 41, y: 602 }, { x: 44, y: 607 }, { x: 55, y: 592 }]
  const action = packingPenAction(asset, points, [], '#cc2222')
  const mark = action.objects[0]
  assert.equal(mark.color, '#cc2222')
  assert.ok(mark.points.some(p => mark.x + p.x > 50 && mark.y + p.y < 597))
  assert.match(packingCheckPath(mark.points, mark.packingCheckVersion), /^M .* Q .* Z$/)
  assert.deepEqual(mark.points.map(p => [Math.round((mark.x + p.x - 40) * 10) / 10, Math.round((mark.y + p.y - 597) * 10) / 10]), [[-2, -6], [6, 6], [14, -12]])
  assert.equal(packingPenAction(asset, points, [mark], '#cc2222').type, 'removeObjects')
  assert.equal(packingPenAction(asset, [...points, { x: 100, y: 602 }], [], '#cc2222'), null)
  assert.equal(packingPenAction(asset, [], [], '#cc2222'), null)
})

test('이전 체크도 새 비율로 표시한다', () => {
  const old = [{ x: -1, y: 4 }, { x: 4, y: 10 }, { x: 15, y: -5 }]
  const previous = [{ x: 2.3, y: 3.5 }, { x: 4.8, y: 6.3 }, { x: 10.8, y: -0.5 }]
  const current = [{ x: 2.1, y: 5 }, { x: 4.1, y: 7.1 }, { x: 12, y: -1.8 }]
  assert.equal(packingCheckPath(old), packingCheckPath(current, 3))
  assert.equal(packingCheckPath(previous, 2), packingCheckPath(current, 3))
})


test('새 속지의 체크는 기존 체크 위치와 호환된다', () => {
  for (const direction of ['portrait', 'landscape']) {
    const oldAsset = `remote-packing-list-${direction}`
    const newAsset = `remote-packing-list-v2-${direction}`
    assert.deepEqual(packingBoxes(newAsset), packingBoxes(oldAsset))
    const { x, y } = packingBoxes(newAsset)[0]
    assert.equal(packingCheckAction(newAsset, { x: x + 5, y: y + 5 }, []).type, 'addObjects')
  }
})


test('새 체크리스트는 4열 7줄이며 각 칸을 체크하고 다시 해제한다', () => {
  for (const direction of ['portrait', 'landscape']) {
    const asset = `remote-packing-list-v3-${direction}`
    const boxes = packingBoxes(asset)
    assert.equal(boxes.length, 28)
    assert.equal(new Set(boxes.map(box => box.x)).size, 4)
    assert.equal(new Set(boxes.map(box => box.y)).size, 7)
    boxes.forEach(({x, y}, index) => {
      const mark = packingCheckAction(asset, {x: x + 5, y: y + 5}, []).objects[0]
      assert.equal(mark.packingCheck, index)
      assert.deepEqual(packingCheckAction(asset, {x: x + 5, y: y + 5}, [mark]).ids, [mark.id])
    })
  }
})


test('새 캐리어에서 체크리스트가 아래로 이동하고 이전 속지는 유지된다', () => {
  for (const direction of ['portrait','landscape']) {
    const before = packingBoxes(`remote-packing-list-v3-${direction}`)
    const after = packingBoxes(`remote-packing-list-v4-${direction}`)
    assert.equal(after.length, 28)
    after.forEach((box, i) => {
      assert.equal(box.x, before[i].x)
      assert.equal(box.y, before[i].y + 12)
      assert.equal(packingCheckAction(`remote-packing-list-v4-${direction}`, {x:box.x+5,y:box.y+5}, []).objects[0].packingCheck, i)
    })
  }
})


test('리디자인 속지의 각 체크박스가 자기 위치에서 켜지고 꺼진다', () => {
  for (const direction of ['portrait', 'landscape']) {
    const asset = `remote-packing-list-v5-${direction}`
    const boxes = packingBoxes(asset)
    assert.equal(boxes.length, 28)
    for (const [index, box] of boxes.entries()) {
      const point = {x: box.x + 5, y: box.y + 5}
      const mark = packingCheckAction(asset, point, []).objects[0]
      assert.equal(mark.packingCheck, index)
      assert.deepEqual(packingCheckAction(asset, point, [mark]).ids, [mark.id])
    }
  }
})
