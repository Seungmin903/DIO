import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePageSpec, exportPageIds, pageListKey } from '../src/editor/utils/exportSelection.js'
const pages = Array.from({ length: 21 }, (_, i) => ({ id: `p${i + 1}` }))
test('selection uses document order, inclusive ranges and current stable ID', () => {
  assert.deepEqual(exportPageIds(pages, { mode: 'pages', selectedIds: ['p3', 'p1'] }), ['p1', 'p3'])
  assert.deepEqual(exportPageIds(pages, { mode: 'range', from: '2', to: '3' }), ['p2', 'p3'])
  assert.deepEqual(exportPageIds(pages, { mode: 'current', currentId: 'p4' }), ['p4'])
})
test('invalid, empty, stale or over-limit selections are blocked', () => {
  for (const input of [{mode:'pages',selectedIds:[]},{mode:'pages',selectedIds:['gone']},{mode:'pages',selectedIds:['p1','p1']},{mode:'range',from:'2',to:'1'},{mode:'range',from:'1.5',to:'2'},{mode:'range',from:'',to:'2'},{mode:'range',from:'1',to:'22'},{mode:'range',from:'1',to:'21'}]) assert.throws(() => exportPageIds(pages,input))
  assert.equal(exportPageIds(pages,{mode:'pages',selectedIds:pages.slice(0,20).map(p=>p.id)}).length,20)
})
test('page insert, delete and reorder invalidate confirmation', () => {
  assert.notEqual(pageListKey(pages),pageListKey([...pages].reverse()))
  assert.notEqual(pageListKey(pages),pageListKey(pages.slice(1)))
})

test('페이지 지정은 인쇄 창처럼 쉼표·범위를 읽고 잘못 적으면 알려 준다', () => {
  assert.deepEqual(parsePageSpec('1-3, 5, 8', 10), [1, 2, 3, 5, 8])
  assert.deepEqual(parsePageSpec('5,2-3,3', 10), [2, 3, 5])
  assert.deepEqual(parsePageSpec('2 ~ 4', 10), [2, 3, 4])
  for (const spec of ['', '0', '11', '4-2', '1-3a', 'a']) assert.throws(() => parsePageSpec(spec, 10))
})
