import test from 'node:test'
import assert from 'node:assert/strict'
import { boundedStraightEnd, snapStraightEnd } from '../src/editor/utils/strokeAssist.js'
import { createStroke } from '../src/editor/utils/strokes.js'
import { lassoHitIds } from '../src/editor/utils/lassoGeometry.js'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'
import { createPdfExportSnapshot } from '../src/editor/utils/pdfSnapshot.js'
import { encodeElement, decodeElement } from '../src/collaboration/canvasElements.js'
const id = '20000000-0000-4000-8000-000000000001'
const start = { x: 200, y: 200, pressure: 1 }
const directions = [{x:-1e12,y:203},{x:1e12,y:203},{x:203,y:-1e12},{x:203,y:1e12},{x:1e12,y:1e12},{x:-1e12,y:1e12}]
const stroke = end => createStroke([start,end], {id,kind:'ball',width:4,color:'#123456'})
const box = (x,y,w,h) => [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]

test('극단적으로 먼 끝점은 직선 방향을 보존하고 한 페이지 여유 밖으로 경계를 키우지 않는다', () => {
  for (const raw of directions) {
    const end=boundedStraightEnd(start,{...raw,pressure:1},1188,840)
    const snapped=snapStraightEnd(start,raw)
    const dx=snapped.x-start.x,dy=snapped.y-start.y
    assert.ok(end.x>=-1188-1e-6 && end.x<=2376+1e-6)
    assert.ok(end.y>=-1188-1e-6 && end.y<=2028+1e-6)
    assert.ok(Math.abs((end.x-start.x)*dy-(end.y-start.y)*dx)/Math.hypot(dx,dy)<1e-6)
    const value=stroke(end)
    assert.deepEqual(lassoHitIds([value],box(195,195,10,10)),[id])
    assert.deepEqual(lassoHitIds([value],box(10000,10000,10,10)),[])
    const encoded=encodeElement(value)
    assert.ok([encoded.x,encoded.y,encoded.width,encoded.height].every(n=>Number.isFinite(n)&&Math.abs(n)<1e9))
    const restored=decodeElement({...encoded,version:1})
    assert.deepEqual(restored.points,value.points)
  }
})

test('일반적인 경계 밖 끝점은 그대로 보존한다',()=>{
  for(const raw of [{x:-300,y:200},{x:1500,y:200},{x:200,y:1100}]) assert.deepEqual(boundedStraightEnd(start,raw,1188,840),snapStraightEnd(start,raw))
})

test('기존 먼 좌표 획도 선택·PNG/PDF 스냅샷·서버 전송에서 페이지 크기를 바꾸지 않는다',async()=>{
  for(const end of [{x:-1000000,y:200,pressure:1},{x:1000000,y:200,pressure:1},{x:200,y:-1000000,pressure:1},{x:1000000,y:1000000,pressure:1}]){
    const value=stroke(end),page={id:'page',canvasWidth:1188,canvasHeight:840,objects:[value]}
    assert.deepEqual(lassoHitIds([value],box(195,195,10,10)),[id])
    assert.deepEqual(lassoHitIds([value],box(2000000,2000000,10,10)),[])
    const png=createExportSnapshot(page,{scale:2})
    assert.deepEqual([png.width,png.height,png.pixelWidth,png.pixelHeight],[1188,840,2376,1680])
    const prepared=await prepareExportSnapshot(png,()=>assert.fail('strokes need no media'))
    assert.deepEqual(prepared.objects[0].points,value.points)
    prepared.dispose()
    const pdf=createPdfExportSnapshot({pages:[page]},{scope:'current',currentPageId:'page',width:1188,height:840})
    assert.deepEqual([pdf.pages[0].pixelWidth,pdf.pages[0].pixelHeight],[2376,1680])
    assert.deepEqual(pdf.pages[0].objects[0].points,value.points)
    const encoded=encodeElement(value),restored=decodeElement({...encoded,version:1})
    assert.deepEqual(restored.points,value.points)
    assert.deepEqual([restored.x,restored.y],[encoded.x,encoded.y])
  }
})
