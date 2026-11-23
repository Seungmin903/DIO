import test from 'node:test'
import assert from 'node:assert/strict'
import { fixedCropFrame, fixedCropImage, transformFixedCrop, createFixedCropGesture } from '../src/editor/utils/fixedCropGeometry.js'
import { visibleRect, cropFromRect, freeZoom } from '../src/editor/utils/photoCropGeometry.js'
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`)
const frame=fixedCropFrame(294,304)
function check(rect,aspect) {
 assert.ok(rect.u0>=-1e-9&&rect.v0>=-1e-9&&rect.u1<=1+1e-9&&rect.v1<=1+1e-9)
 near((rect.u1-rect.u0)*aspect,rect.v1-rect.v0)
 const image=fixedCropImage(rect,frame)
 near(image.left+rect.u0*image.width,frame.left)
 near(image.top+rect.v0*image.height,frame.top)
 near((rect.u1-rect.u0)*image.width,frame.width)
 near((rect.v1-rect.v0)*image.height,frame.height)
 const restored=visibleRect(cropFromRect(rect),1,aspect)
 for(const k of Object.keys(rect))assert.ok(Math.abs(rect[k]-restored[k])<0.001)
}
for(const aspect of [0.4,1,2.5]) test(`repeated zoom/pan keeps circle fixed and source square ${aspect}`,()=>{
 let rect=visibleRect({fx:0.5,fy:0.5,zoom:1},1,aspect)
 for(let i=0;i<50;i++)for(const zoom of [1,3,9,2,1]) {
  rect=transformFixedCrop(rect,frame,zoom,(i%2?1:-1)*10000,10000,{x:0.2,y:0.8})
  check(rect,aspect)
 }
})
function event(points) {
 const touches=points.map(([x,y])=>({pageX:x+30,pageY:y+100,locationX:x,locationY:y}))
 return {nativeEvent:{touches,...(touches[0]??{pageX:30,pageY:100,locationX:0,locationY:0})}}
}
function gestureFixture() {
 let rect=visibleRect({fx:0.5,fy:0.5,zoom:3},1,1)
 const locks=[]
 const gesture=createFixedCropGesture(()=>({rect,frame,maxZoom:9,onChange:next=>{rect=next},onInteraction:value=>locks.push(value)}))
 return {gesture,locks,get rect(){return rect}}
}
test('1→2→1 fingers rebase without a render or jump, then keep panning',()=>{
 const f=gestureFixture(),g=f.gesture
 g.onResponderGrant(event([[90,100]]));g.onResponderMove(event([[100,120]]))
 let before={...f.rect}
 g.onResponderStart(event([[100,120],[160,120]]));g.onResponderMove(event([[100,120],[160,120]]))
 assert.deepEqual(f.rect,before)
 g.onResponderMove(event([[70,120],[190,120]]));near(freeZoom(f.rect),6)
 before={...f.rect}
 g.onResponderEnd(event([[190,120]]));g.onResponderMove(event([[190,120]]));assert.deepEqual(f.rect,before)
 g.onResponderMove(event([[170,100]]));assert.notDeepEqual(f.rect,before)
 check(f.rect,1);g.onResponderRelease();assert.equal(f.locks.at(-1),false)
})
test('missing start/end event also rebases on finger-count change',()=>{
 const f=gestureFixture(),g=f.gesture
 g.onResponderGrant(event([[100,100]]));const before={...f.rect}
 g.onResponderMove(event([[100,100],[200,100]]));assert.deepEqual(f.rect,before)
 g.onResponderMove(event([[90,100],[210,100]]));const pinched={...f.rect}
 g.onResponderMove(event([[210,100]]));assert.deepEqual(f.rect,pinched)
 g.onResponderMove(event([[200,100]]));assert.notDeepEqual(f.rect,pinched)
})
test('pinch has stable focal point away from boundaries',()=>{
 const initial={u0:0.3,v0:0.3,u1:0.7,v1:0.7},anchor={x:0.2,y:0.8}
 const next=transformFixedCrop(initial,frame,5,0,0,anchor)
 near(initial.u0+anchor.x*0.4,next.u0+anchor.x*(next.u1-next.u0))
 near(initial.v0+anchor.y*0.4,next.v0+anchor.y*(next.v1-next.v0))
})
test('termination unlocks scroll and next gesture starts from latest crop',()=>{
 const f=gestureFixture(),g=f.gesture
 g.onResponderGrant(event([[100,100]]));g.onResponderMove(event([[500,500]]))
 g.onResponderTerminate();assert.equal(f.locks.at(-1),false)
 const before={...f.rect};g.onResponderGrant(event([[100,100]]));g.onResponderMove(event([[100,100]]))
 assert.deepEqual(f.rect,before)
 g.onResponderEnd(event([]));assert.equal(f.locks.at(-1),false)
})
