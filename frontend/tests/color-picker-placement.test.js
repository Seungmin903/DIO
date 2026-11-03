import test from 'node:test'
import assert from 'node:assert/strict'
import { colorPickerPlacement } from '../src/editor/utils/colorPickerPlacement.js'

test('독립 색 창은 설정 옆에 배치하고 오른쪽 공간이 없으면 왼쪽을 사용한다', () => {
  assert.equal(colorPickerPlacement({ x: 327, y: 156, width: 320 },1280,800).left,659)
  assert.equal(colorPickerPlacement({ x: 800, y: 156, width: 320 },1280,800).left,492)
})
test('폰·가로 화면·안전 영역에서 독립 창 전체가 화면 안에 들어온다', () => {
  for(const [width,height] of [[320,568],[390,844],[844,390],[1024,768]]) {
    const insets={top:24,bottom:20,left:8,right:8}
    const r=colorPickerPlacement({x:width-30,y:height-30,width:320},width,height,insets)
    assert.ok(r.left>=16 && r.top>=32)
    assert.ok(r.left+r.width<=width-16 && r.top+r.maxHeight<=height-28)
  }
})
