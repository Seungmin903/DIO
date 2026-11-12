import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {canSelectMediaPhoto,mediaLibrarySizeMessage} from '../src/diary/services/mediaLibraryApi.js'
import {createCanvasMedia} from '../src/collaboration/canvasMedia.js'
import {createMediaThumbnailCache} from '../src/diary/services/mediaThumbnailCache.js'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'))
const code=expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/services/mediaLibraryRuntime.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
const id='10000000-0000-4000-8000-000000000001'
function fixture({account='1',diaryAccount='1'}={}){
 let session='a',currentAccount=account,downloads=0,uploads=0,thumbnails=0;const mappings=[]
 const row={mediaFileId:id,mediaType:'IMAGE',originalFilename:'기록.gif',fileSize:1024}
 const mocks={
  '@react-native-async-storage/async-storage':{setItem:async(...args)=>mappings.push(args)},
  './memberStorage.js':{memberDocumentKey:()=> 'account-doc'},
  '../../editor/services/mediaStore':{mediaService:{get:async()=>({media:{width:100,height:200,extension:'gif'}})}},
  '../../editor/utils/mediaImport.js':{mediaDisplayName:()=> '기록'},
  'expo/fetch':{fetch:()=>{}},
  '../../auth/authService':{authService:{getSessionKey:()=>session,getCurrentUserId:()=>currentAccount},apiBaseUrl:'https://dio.test/api/v1'},
  './memberTransport.js':{createAuthenticatedMemberTransport:()=>()=>{}},
  '../../collaboration/canvasMedia.js':{createMediaRequest:()=>()=>{}},
  './mediaLibraryApi.js':{canSelectMediaPhoto,mediaLibrarySizeMessage,createMediaLibraryApi:()=>({get:async()=>row,file:async()=>{downloads++;return new Uint8Array([1])},thumbnail:async()=>{thumbnails++;return new Uint8Array([137,80,78,71,13,10,26,10])}})},
  './mediaThumbnailCache.js':{createMediaThumbnailCache},
  './mediaThumbnailFiles':{createMediaThumbnailFiles:()=>({read:async()=>null,write:async()=> 'thumbnail-uri',remove:async()=>{}})},
  '../../editor/services/canvasMediaFiles':{canvasMediaFiles:{cached:async()=>false,save:async()=>{},upload:async()=>uploads++}},
  '../../editor/services/image':{pickImages:async()=>[]},
 }
 const module={exports:{}};new Function('require','module','exports',code)(name=>{assert.ok(name in mocks,name);return mocks[name]},module,module.exports)
 const api=module.exports.createMediaLibraryRuntime({source:'member-api',memberAccountId:diaryAccount})
 return {api,row,mappings,setAccount:v=>currentAccount=v,setSession:v=>session=v,counts:()=>({downloads,uploads}),thumbnails:()=>thumbnails}
}
test('올린 사진 선택은 서버 ID·GIF 크기를 유지하고 기존 업로드 매핑을 기록한다',async()=>{
 const f=fixture(),image=await f.api.selectPhoto(f.row,{source:'member-api',memberAccountId:'1'})
 assert.equal(image.mediaFileId,id);assert.equal(image.src,`media:${id}`);assert.equal(image.height,200);assert.equal(image.extension,'gif');assert.equal(image.serverStored,true)
 assert.deepEqual(f.counts(),{downloads:1,uploads:0});assert.deepEqual(f.mappings,[[`account-doc:media-uploads:v1:https%3A%2F%2Fdio.test%2Fapi%2Fv1:${id}`,id]])
 const saved=new Map(f.mappings)
 const media=createCanvasMedia({key:'account-doc:media-uploads:v1:https%3A%2F%2Fdio.test%2Fapi%2Fv1',storage:{getItem:async key=>saved.get(key)},files:{upload:()=>assert.fail('재업로드 금지')},request:()=>assert.fail('재업로드 요청 금지')})
 const body=await media.prepare({changes:{creates:[{elementType:'PHOTO',mediaFileId:image.mediaFileId}]}})
 assert.equal(body.changes.creates[0].mediaFileId,id);media.dispose()
})
test('계정 전환·다른 계정 다이어리·이미지 외 선택은 삽입용 매핑을 기록하지 않는다',async()=>{
 const f=fixture();f.setSession('b');await assert.rejects(f.api.selectPhoto(f.row,{source:'member-api',memberAccountId:'1'}));assert.equal(f.mappings.length,0)
 const g=fixture();await assert.rejects(g.api.selectPhoto(g.row,{source:'member-api',memberAccountId:'2'}));await assert.rejects(g.api.selectPhoto({...g.row,mediaType:'DOCUMENT'},{}));assert.equal(g.mappings.length,0)
})

test('패널이 넘기는 다이어리 계정은 실제 로그인 계정과 다르면 생성부터 거절한다',()=>{
 assert.throws(()=>fixture({account:'2',diaryAccount:'1'}),{status:401})
})
test('세션 문자열이 같아도 로그인 사용자가 달라지면 목록·파일 선택을 차단한다',async()=>{
 const f=fixture();f.setAccount('2');await assert.rejects(f.api.previewCached(f.row),{status:401});await assert.rejects(f.api.selectPhoto(f.row,{source:'member-api',memberAccountId:'1'}),{status:401});assert.equal(f.counts().downloads,0)
})
test('목록 미리보기는 원본을 내려받지 않으며 5MB 초과 선택도 요청 전에 거절한다',async()=>{
 const f=fixture();assert.equal(await f.api.previewCached(f.row),false);assert.equal(f.counts().downloads,0)
	await assert.rejects(f.api.selectPhoto({...f.row,fileSize:5*1024*1024+1},{source:'member-api',memberAccountId:'1'}),error=>error.status===413&&error.message===mediaLibrarySizeMessage());assert.equal(f.counts().downloads,0);assert.equal(f.mappings.length,0)
})
test('자동 썸네일은 클릭·원본 다운로드 없이 로드하고 같은 패널에서 재사용한다',async()=>{
 const f=fixture()
 assert.equal(await f.api.previewThumbnail(f.row),'thumbnail-uri')
 assert.equal(await f.api.previewThumbnail(f.row),'thumbnail-uri')
 assert.equal(f.thumbnails(),1);assert.equal(f.counts().downloads,0);assert.equal(f.mappings.length,0)
 f.setAccount('2');await assert.rejects(f.api.previewThumbnail(f.row),{status:401})
})

test('표시 참조·재조회·무효화도 현재 계정을 검사하고 세션 종료 뒤 참조 반환은 가능하다',async()=>{
 const f=fixture(),release=f.api.retainThumbnail(f.row)
 const uri=await f.api.previewThumbnail(f.row)
 assert.equal(await f.api.retryThumbnail(f.row,uri),'thumbnail-uri')
 f.setAccount('2')
 assert.throws(()=>f.api.retainThumbnail(f.row),{status:401})
 await assert.rejects(f.api.retryThumbnail(f.row,uri),{status:401})
 await assert.rejects(f.api.invalidateThumbnail(f.row,uri),{status:401})
 release();release();f.api.dispose()
})
