import test from 'node:test'
import assert from 'node:assert/strict'
import { brushSelection, editHistory, linkSelection, materializeGroups, moveHistory, splitGroups, sortedStickerGroups, thumbnailPlacements, excludeStickerGroup } from '../src/editor/utils/stickerSplitGroups.js'
import { saveSplitSelection } from '../src/editor/utils/stickerSplitSave.js'

const parts = ['a', 'b', 'c'].map((id, i) => ({ id, uri: `file:///${id}.png`, x: i * 10, y: 2, width: 3, height: 4 }))
test('직접 분리한 조각은 거리 묶기에서 빠지며 명시적으로 다시 묶을 수 있다', () => {
  const all = [...parts, { ...parts[0], id: 'd' }, { ...parts[1], id: 'e' }]
  const ids = all.map(p => p.id), edges = [['a', 'b'], ['b', 'c'], ['d', 'e']]
  assert.deepEqual(splitGroups(all, ids, edges, [], ['a', 'b', 'c']).map(g => g.members.map(p => p.id)), [['a'], ['b'], ['c'], ['d', 'e']])
  assert.deepEqual(splitGroups(all, ids, edges, [['a', 'b']], ['a', 'b', 'c']).map(g => g.members.map(p => p.id)), [['a', 'b'], ['c'], ['d', 'e']])
})
test('직접 분리한 묶음은 원본 PNG를 각각 저장하며 합성이나 새 분석을 하지 않는다', async () => {
  const separated = splitGroups(parts, ['a', 'b', 'c'], [['a', 'b']], [], ['a', 'b'])
  const saved = await materializeGroups(separated, () => assert.fail('must reuse original PNGs'), () => assert.fail())
  assert.deepEqual(saved.map(part => part.id), ['a', 'b', 'c'])
  assert.equal(saved[0], parts[0]); assert.equal(saved[1], parts[1])
})
test('최종 묶음을 가로×세로 면적으로 정렬하고 동률 순서·원본 ID·좌표를 유지한다', () => {
  const input = [{ id: 'small', width: 3, height: 3, area: 1000 }, { id: 'wide', width: 100, height: 3, area: 1 }, { id: 'tie', width: 10, height: 30, area: 2 }]
  const result = sortedStickerGroups(input)
  assert.deepEqual(result.map(g => g.id), ['wide', 'tie', 'small'])
  assert.deepEqual(result.map(g => g.number), [1, 2, 3])
  assert.deepEqual(input.map(g => g.id), ['small', 'wide', 'tie']); assert.equal(input[0].number, undefined)
})
test('묶음 썸네일은 같은 배율과 원본 상대 위치를 유지하며 PNG를 생성하지 않는다', () => {
  const group = { x: 10, y: 20, width: 50, height: 30, members: [
    { id: 'a', uri: 'a.png', x: 10, y: 20, width: 20, height: 10 },
    { id: 'b', uri: 'b.png', x: 50, y: 40, width: 10, height: 10 },
  ] }
  assert.deepEqual(thumbnailPlacements(group, 116, 76), [
    { id: 'a', uri: 'a.png', left: 8, top: 8, width: 40, height: 20 },
    { id: 'b', uri: 'b.png', left: 88, top: 48, width: 20, height: 20 },
  ])
  assert.deepEqual(thumbnailPlacements(group, 0, 0), [])
})
test('카드 탭은 묶음 구성 객체만 제외하고 원본으로 다시 복구할 수 있다', () => {
  const group = splitGroups(parts, ['a', 'b', 'c'], [['a', 'b']])[0]
  const next = excludeStickerGroup(['a', 'b', 'c'], group)
  assert.deepEqual(next, ['c']); assert.deepEqual(brushSelection(next, ['a', 'b'], true).sort(), ['a', 'b', 'c'])
  assert.equal(parts.length, 3)
})
test('카드 정렬 순서와 저장 순서를 동일하게 유지한다', async () => {
  const singles = parts.map((part, index) => ({ ...part, width: index + 3, height: 4 }))
  const groups = sortedStickerGroups(splitGroups(singles, ['a', 'b', 'c']))
  const output = await materializeGroups(groups, () => assert.fail('no composite needed'), () => {})
  assert.deepEqual(output.map(p => p.id), ['c', 'b', 'a'])
})
test('거리 연결은 연쇄 묶고 제외된 연결 고리가 없으면 남은 후보만 다시 묶는다', () => {
  assert.deepEqual(splitGroups(parts, ['a', 'b', 'c'], [['a', 'b'], ['b', 'c']]).map(g => g.members.map(p => p.id)), [['a', 'b', 'c']])
  assert.equal(splitGroups(parts, ['a', 'c'], []).length, 2)
  assert.equal(splitGroups(parts, ['a', 'c'], [['a', 'c']]).length, 1)
  assert.deepEqual(splitGroups(parts, [], []).length, 0)
})
test('수동 합치기는 원본을 보존하고 일부 제외·재선택 및 합치기를 반복해도 남는다', () => {
  let links = linkSelection([], ['a', 'b'])
  links = linkSelection(links, ['b', 'c'])
  const group = splitGroups(parts, ['a', 'c'], [], links)[0]
  assert.deepEqual(group.members.map(p => p.id), ['a', 'c'])
  assert.deepEqual([group.x, group.y, group.width, group.height], [0, 2, 23, 4])
  assert.equal(splitGroups(parts, ['a', 'b', 'c'], [], links)[0].members.length, 3)
  assert.equal(parts.length, 3)
})
test('브러시는 닿은 객체만 멱등적으로 추가·제외한다', () => {
  assert.deepEqual(brushSelection(['a', 'b'], ['b', 'c'], true), ['a', 'b', 'c'])
  assert.deepEqual(brushSelection(['a', 'b', 'c'], ['b', 'b'], false), ['a', 'c'])
  assert.deepEqual(brushSelection(['a'], [], false), ['a'])
})
test('30회 이력 한도·실행 취소·다시 실행·분기 수정', () => {
  let h = { past: [], present: { distance: 0 }, future: [] }
  for (let i = 1; i <= 40; i++) h = editHistory(h, { distance: i })
  assert.equal(h.past.length, 30)
  h = moveHistory(h); assert.equal(h.present.distance, 39)
  h = moveHistory(h, true); assert.equal(h.present.distance, 40)
  h = editHistory(moveHistory(h), { distance: 1 }); assert.equal(h.future.length, 0)
  assert.equal(editHistory(h, { distance: 1 }), h)
})
test('미리보기의 묶음 개수·순서와 저장 PNG 수가 일치하고 원래 상대 좌표를 전달한다', async () => {
  const groups = splitGroups(parts, ['a', 'b', 'c'], [['a', 'b']]), calls = [], tracked = []
  const output = await materializeGroups(groups, members => {
    calls.push(members)
    return { id: 'merge', promise: Promise.resolve({ id: 'merge', uri: 'file:///merged.png', width: 13, height: 4 }) }
  }, job => tracked.push(job.id))
  assert.equal(output.length, groups.length); assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].map(p => p.x), [0, 10]); assert.deepEqual(tracked, ['merge'])
  let published
  await saveSplitSelection({ parts: output, name: '묶음', importFiles: async files => files.map((f, i) => ({ src: f.uri, mediaFileId: `fresh${i}`, width: f.width, height: f.height })),
    publish: async (_folder, _name, value) => { published = value }, discard: async () => {} })
  assert.equal(published.length, groups.length)
})
test('묶음 크기 한도와 합성 오류는 누락 없이 실패하며 같은 구성으로 재시도할 수 있다', async () => {
  const groups = splitGroups(parts, ['a', 'b'], [['a', 'b']])
  await assert.rejects(materializeGroups(groups, () => ({ promise: Promise.reject(new Error('PNG_WRITE_FAILED')) }), () => {}), /PNG_WRITE_FAILED/)
  assert.deepEqual(groups[0].members, parts.slice(0, 2))
  const result = await materializeGroups(groups, () => ({ promise: Promise.resolve({ uri: 'file:///retry.png' }) }), () => {})
  assert.equal(result[0].uri, 'file:///retry.png')
  await assert.rejects(materializeGroups([{ ...groups[0], width: 4000, height: 3000 }], () => assert.fail('must preflight'), () => {}), /STICKER_TOO_LARGE/)
  await assert.rejects(materializeGroups(Array.from({ length: 5 }, () => ({ width: 2800, height: 2800 })), () => assert.fail('must preflight'), () => {}), /OUTPUT_TOO_LARGE/)
})
