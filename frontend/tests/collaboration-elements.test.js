import test from 'node:test'
import assert from 'node:assert/strict'
import {encodeElement,decodeElement,sharedObject,sharedElement} from '../src/collaboration/canvasElements.js'
import {createCanvasSession} from '../src/collaboration/canvasSession.js'
const page='10000000-0000-4000-8000-000000000001',diary='10000000-0000-4000-8000-000000000002',id='20000000-0000-4000-8000-000000000001'
const object=type=>({id,type,x:1,y:2,w:80,h:40})
test('기기 URL은 제외하고 기존 에셋 ID와 사진 칸을 왕복한다',()=>{
 const media='50000000-0000-4000-8000-000000000001'
 for(const type of ['photo','sticker','tape']){
  const input={...object(type),mediaFileId:media,src:`media:${media}`,poster:'data:private-preview'}
  assert.equal(sharedObject(input),true)
  const encoded=encodeElement(input);assert.equal(encoded.mediaFileId,media)
  assert.equal(JSON.stringify(encoded).includes('private-preview'),false)
  const decoded=decodeElement({...encoded,version:1})
  assert.equal(decoded.src,`media:${media}`)
 }
 assert.equal(sharedObject({...object('photo'),src:'file:///private-image'}),false)
 const frame=encodeElement({...object('photo'),cells:[{mediaFileId:media,src:`media:${media}`,poster:'data:preview'},null]})
 assert.equal(frame.propertiesJson.cells[0].src,undefined)
 assert.equal(decodeElement({...frame,version:1}).cells[0].src,`media:${media}`)
})
test('과거 이미지 포함 전송 대기는 보관하고 제거한 경로·파일 전송을 재시도하지 않는다',async()=>{
 const pending={id,pageId:page,before:[],after:[object('photo')],request:{clientOperationId:id,changes:{creates:[{elementId:id,elementType:'PHOTO',mediaFileId:id}]}}}
 let saved=JSON.stringify({format:2,pageId:page,diaryId:diary,base:[],uiLocal:[],queue:[pending],control:null,recent:[]})
 let applied=0
 const session=createCanvasSession({api:{load:async()=>[],history:async()=>({items:[]}),apply:async()=>{applied++;throw Error('must not upload')}},
  storage:{getItem:async()=>saved,setItem:async(_k,v)=>{saved=v}},key:'journal',pageId:page,diaryId:diary,createId:()=>id})
 await session.restore([]);await session.synchronize()
 assert.equal(applied,0);assert.equal(session.snapshot().queue.length,0)
 const held=session.snapshot().deferredMedia
 assert.equal(held.length,1);assert.equal(held[0].id,pending.id);assert.deepEqual(held[0].request,pending.request);assert.equal(held[0].compact,true)
})
