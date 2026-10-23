import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLayerRows } from '../src/editor/utils/layerRows.js'

test('펜·형광펜은 목록에만 빠지고 문서의 순서·hidden·데이터는 그대로 유지된다', () => {
  const layers = [
    { id: 'pen', type: 'stroke', kind: 'pen', hidden: false },
    { id: 'photo', type: 'photo' },
    { id: 'marker', type: 'stroke', kind: 'highlighter' },
    { id: 'text', type: 'text' }, { id: 'sticker', type: 'sticker' }, { id: 'tape', type: 'tape' },
  ]
  const saved = JSON.stringify(layers)
  const rows = buildLayerRows(layers, new Set())
  assert.deepEqual(rows.map(row => row.object.id), ['photo', 'text', 'sticker', 'tape'])
  assert.equal(JSON.stringify(layers), saved)
  assert.equal(rows[0].object, layers[1])
  assert.equal(buildLayerRows([layers[0], layers[2]], new Set()).length, 0)
})

test('혼합 그룹의 자식 획은 숨겨도 그룹 선택·이동에 쓰는 원래 멤버와 앵커는 유지한다', () => {
  const layers = [
    { id: 'pen', type: 'stroke', groupId: 'mixed' },
    { id: 'photo', type: 'photo', groupId: 'mixed' },
    { id: 'marker', type: 'stroke', groupId: 'mixed' },
  ]
  const expanded = buildLayerRows(layers, new Set())
  assert.deepEqual(expanded.map(row => row.kind), ['group', 'object'])
  assert.equal(expanded[1].object.id, 'photo')
  assert.equal(expanded[1].nested, true)
  assert.deepEqual(expanded[0].members.map(member => member.id), ['pen', 'photo', 'marker'])
  assert.equal(expanded[0].members[0], layers[0])
  const collapsed = buildLayerRows(layers, new Set(['mixed']))
  assert.equal(collapsed.length, 1)
  assert.deepEqual(collapsed[0].members, layers)
})

test('획만 있는 그룹은 접힘 여부와 무관하게 숨기고 다른 그룹과 행 순서를 보존한다', () => {
  const layers = [
    { id: 'pen', type: 'stroke', groupId: 'ink' },
    { id: 'marker', type: 'stroke', groupId: 'ink' },
    { id: 'photo', type: 'photo', groupId: 'visible', groupName: '여행' },
    { id: 'text', type: 'text', groupId: 'visible' },
    { id: 'sticker', type: 'sticker' },
  ]
  for (const collapsed of [new Set(), new Set(['ink'])]) {
    const rows = buildLayerRows(layers, collapsed)
    assert.deepEqual(rows.map(row => row.kind === 'group' ? row.groupId : row.object.id), ['visible', 'photo', 'text', 'sticker'])
    assert.equal(rows[0].name, '여행')
    assert.equal(rows[0].members.length, 2)
  }
})
