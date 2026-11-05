import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemberDiaryApi } from '../src/diary/services/memberDiaryApi.js'
import { createCanvasMedia } from '../src/collaboration/canvasMedia.js'

const id='76cf3259-4067-4a62-88cc-de6af15347ee'
const local='516c9cb0-a6ba-4230-8ec5-536423f44889'
const remote='163540cb-2e5b-4afb-8230-d33df793a97b'
const row={diaryId:id,diaryTitle:'공유 표지',coverColor:'#123456',coverStyle:'PLAIN',visibility:'MEMBERS',
  createdAt:'2026-11-05T00:00:00Z',updatedAt:'2026-11-05T00:00:00Z',version:'1',myMembership:{isFavorite:false}}
const permission=owner=>({canEditMetadata:owner,canEditCanvas:true,canTrash:owner,canRestore:false,canPermanentlyDelete:false})
const metadata=(owner,cover)=>({...row,myRole:owner?'OWNER':'EDITOR',canEdit:owner,permissions:permission(owner),cover})
const memory=()=>{const values=new Map();return {async getItem(key){return values.get(key)??null},async setItem(key,value){values.set(key,value)}}}

test('소유자의 사진 표지 저장 후 상대 기기가 동일한 배치와 서버 이미지를 불러온다',async()=>{
  let saved=null,uploads=0,downloaded=[]
  const bytes=new Uint8Array([1,2,3])
  const ownerMedia=createCanvasMedia({key:'owner',storage:memory(),files:{async upload(file){assert.equal(file,local);return 'photo bytes'},async cached(){return true}},
    async request(path,{body}){assert.equal(path,'/media');assert.equal(body,'photo bytes');uploads++;return {mediaFileId:remote}}})
  const guestMedia=createCanvasMedia({key:'editor',storage:memory(),files:{async cached(){return false},async save(file,data){downloaded.push({file,data})}},
    async request(path){assert.equal(path,`/media/${remote}/file`);return bytes}})
  const owner=createMemberDiaryApi(async req=>{
    assert.equal(req.method,'PATCH');assert.equal(req.body.expectedVersion,'1');saved=req.body.cover
    return {diary:metadata(true,saved)}
  },{media:ownerMedia})
  const editor=createMemberDiaryApi(async()=>({items:[{diary:metadata(false,saved),pageCount:1,shared:true}],hasNext:false,nextCursor:null}),{media:guestMedia})
  const crop={x:0.1,y:0.2,w:0.7,h:0.6}
  const original={kind:'photo',enabled:true,photo:{src:'file:///device-only.jpg',mediaFileId:local,crop,aspect:1.4},title:{text:'같은 표지'},stickers:[{id:'stamp',builtin:'heart'}]}
  const written=await owner.update(id,{expectedVersion:'1',cover:original})
  const {items:[shared]}=await editor.list()
  await new Promise(setImmediate)
  assert.deepEqual(shared.cover,written.cover)
  assert.deepEqual(shared.cover.photo,{src:`media:${remote}`,mediaFileId:remote,crop,aspect:1.4})
  assert.deepEqual(downloaded,[{file:remote,data:bytes}])
  assert.equal(uploads,1)
  assert.equal(original.photo.src,'file:///device-only.jpg')
})

test('사진을 올릴 수 없으면 로컬 주소나 기본 표지를 대신 저장하지 않는다',async()=>{
  let writes=0
  const api=createMemberDiaryApi(async()=>{writes++},{media:{async prepare(){throw new Error('upload failed')}}})
  await assert.rejects(api.update(id,{expectedVersion:'1',cover:{kind:'photo',photo:{src:`media:${local}`}}}),/upload failed/)
  assert.equal(writes,0)
})
