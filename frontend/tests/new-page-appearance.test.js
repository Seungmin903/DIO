import test from 'node:test'
import assert from 'node:assert/strict'
import { newPageAppearance } from '../src/editor/templates/newPageAppearance.js'

const pen = 'nanum-pen'

test('글꼴을 고른 적 없는 다이어리의 새 속지는 공방 기본 글꼴을 따른다', () => {
  const next = newPageAppearance({ backgroundColor: '#FFFFFF', layoutColor: '#292929' }, { font: pen })
  assert.equal(next.font, pen)
  assert.equal(next.backgroundColor, '#FFFFFF')
})

test('다이어리에서 직접 고른 글꼴이 있으면 기본값으로 덮지 않는다', () => {
  assert.equal(newPageAppearance({ font: 'nanum-myeongjo' }, { font: pen }), null)
})

test('공방 기본에 글꼴이 없으면 바꾸지 않는다', () => {
  assert.equal(newPageAppearance(undefined, undefined), null)
})

test('색은 다이어리 설정을 그대로 둔다', () => {
  const next = newPageAppearance({ backgroundColor: '#F5EFE0', layoutColor: '#3B3F4A' }, { font: pen, backgroundColor: '#000000' })
  assert.equal(next.backgroundColor, '#F5EFE0')
  assert.equal(next.layoutColor, '#3B3F4A')
})
