import test from 'node:test'
import assert from 'node:assert/strict'
import { waitForExportFonts } from '../src/editor/utils/exportFonts.js'
import { selectExportRaster } from '../src/editor/utils/exportSampling.js'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'
import { pngQualityWarning } from '../src/editor/utils/pageImageQuality.js'

test('폰트 준비는 실제 한글·줄바꿈과 스타일을 전달하고 완료 전 반환하지 않는다', async () => {
  let finish, ready = false, request
  const job = waitForExportFonts([{type:'text',text:'가나다\nAB',font:'serif',fontSize:24,bold:true,italic:true}], {
    load: (font, text) => { request = [font,text]; return new Promise(ok => {finish=ok}) }, ready: Promise.resolve(),
  }).then(() => {ready=true})
  assert.deepEqual(request,['normal 700 24px serif','가나다\nAB']); await Promise.resolve(); assert.equal(ready,false)
  finish(); await job; assert.equal(ready,true)
  await assert.rejects(waitForExportFonts([{type:'text',text:'실패'}],{load:()=>Promise.reject(Error('font')),ready:Promise.resolve()}),{code:'EXPORT_FONT_FAILED'})
  await waitForExportFonts([],undefined)
})

test('12MP 사진은 안전한 표시본으로 대체하고 확대 경고를 전달한다', async () => {
  const object={id:'a',type:'photo',mediaFileId:'a',x:0,y:0,w:1188,h:840,rotation:0,crop:{zoom:1.4}}
  const snapshot=createExportSnapshot({objects:[object]},{scale:2})
  const record={blob:'original',displayBlob:'display',media:{width:4000,height:3000,mimeType:'image/jpeg',display:{width:2048,height:1536,mimeType:'image/jpeg'}}}
  const chosen=selectExportRaster(record,[object],snapshot)
  assert.equal(chosen.blob,'display');assert.equal(chosen.qualityWarning,'display-upscaled');assert.ok(chosen.size.width<=2048)
  const prepared=await prepareExportSnapshot(snapshot,async()=>({uri:'safe',qualityWarning:chosen.qualityWarning,dispose(){}}))
  assert.equal(prepared.rasterWarnings.length,1);assert.match(pngQualityWarning({platform:'web',rasterWarnings:prepared.rasterWarnings}),/표시용/);prepared.dispose()
  assert.throws(()=>selectExportRaster({...record,displayBlob:null},[object],snapshot),{code:'EXPORT_RASTER_TOO_LARGE'})
  assert.equal(selectExportRaster(record,[{...object,w:100,h:100}],snapshot).qualityWarning,undefined)
})
