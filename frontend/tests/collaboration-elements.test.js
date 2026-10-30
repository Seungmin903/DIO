import test from 'node:test'
import assert from 'node:assert/strict'
import {encodeElement,decodeElement,sharedObject,sharedElement} from '../src/collaboration/canvasElements.js'
import {createCanvasSession} from '../src/collaboration/canvasSession.js'
const page='10000000-0000-4000-8000-000000000001',diary='10000000-0000-4000-8000-000000000002',id='20000000-0000-4000-8000-000000000001'
const object=type=>({id,type,x:1,y:2,w:80,h:40})
test('필압·스타일·기본 스티커는 보존하고 사진·사용자 이미지는 전송 대상에서 제외한다',()=>{
 for(const input of [{...object('stroke'),points:[{x:1,y:2,pressure:.3}],penKind:'brush'}, {...object('sticker'),asset:'tw-1f600'}]){
  const encoded=encodeElement(input);assert.deepEqual(encodeElement(decodeElement({...encoded,version:1})),encoded)
 }
 for(const input of [object('photo'),{...object('sticker'),mediaFileId:id,src:`media:${id}`},{...object('tape'),src:'file:///private-image'}]){
  assert.equal(sharedObject(input),false);assert.throws(()=>encodeElement(input))
 }
 assert.equal(sharedElement({elementType:'PHOTO'}),false)
 assert.equal(sharedElement({elementType:'STICKER',mediaFileId:id}),false)
})
test('과거 이미지 포함 전송 대기는 보관하고 제거한 경로·파일 전송을 재시도하지 않는다',async()=>{
 const pending={id,pageId:page,before:[],after:[object('photo')],request:{clientOperationId:id,changes:{creates:[{elementId:id,elementType:'PHOTO',mediaFileId:id}]}}}
 let saved=JSON.stringify({format:2,pageId:page,diaryId:diary,base:[],uiLocal:[],queue:[pending],control:null,recent:[]})
 let applied=0
 const session=createCanvasSession({api:{load:async()=>[],history:async()=>({items:[]}),apply:async()=>{applied++;throw Error('must not upload')}},
  storage:{getItem:async()=>saved,setItem:async(_k,v)=>{saved=v}},key:'journal',pageId:page,diaryId:diary,createId:()=>id})
 await session.restore([]);await session.synchronize()
 assert.equal(applied,0);assert.equal(session.snapshot().queue.length,0)
 assert.deepEqual(session.snapshot().deferredMedia,[pending])
})
