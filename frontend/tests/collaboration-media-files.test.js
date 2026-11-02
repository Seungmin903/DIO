import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {detectMediaType,checkDimensions} from '../src/editor/utils/mediaPolicy.js'
import * as plan from '../src/editor/utils/shareImagePlan.js'
import {shareJpegAttempts} from '../src/editor/utils/shareImagePlan.js'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'))
function adapter(platform,stored){
 const writes=[],temps=[],parts=[],seeds=[],jpegCalls=[]
 const repository={get:async()=>stored,decode:async()=>({width:20,height:10}),createDisplay:async()=>null,verifyDisplay:async()=>{},save:async(source,metadata)=>{writes.push({source,metadata});return 'cached-image'},dispose:async()=>{}}
 class File{constructor(_path,name){this.uri=`cache/${name}`;temps.push(this)}create(){}write(bytes){this.bytes=bytes}delete(){this.deleted=true}}
 class Form{append(...args){parts.push(args)}}
 const code=expo('@babel/core').transformSync(readFileSync(new URL(`../src/editor/services/canvasMediaFiles.${platform}.js`,import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
 const module={exports:{}}
 new Function('require','module','exports','FormData',code)(name=>name.endsWith('/mediaStore')?{mediaRegistry:{seed:(id,value)=>seeds.push({id,...value})}}:name.includes('mediaRepository')?repository:name.includes('mediaPolicy')?{detectMediaType,checkDimensions}:name.includes('shareImagePlan')?plan:name.includes('shareImage')?{toShareJpeg:async(source,options)=>{jpegCalls.push({source,options});return {uri:'jpeg-uri',blob:{jpeg:true},size:1234}}}:{File,Paths:{cache:'cache'}},module,module.exports,Form)
 return {files:module.exports.canvasMediaFiles,writes,temps,parts,seeds,jpegCalls}
}
for(const platform of ['web','native']){
 test(`${platform}: HEIC는 기존 표시본으로 업로드하고 기기 원본을 건드리지 않는다`,async()=>{
  const display={uri:'display',size:10},original={uri:'original',size:100}
  const a=adapter(platform,{media:{fileSize:100,extension:'heic',mimeType:'image/heic',display:{fileSize:10,extension:'jpg',mimeType:'image/jpeg'}},blob:original,displayBlob:display})
  await a.files.upload('id','PHOTO');assert.equal(a.parts[1][1],'PHOTO')
  assert.equal(platform==='web'?a.parts[0][1]:a.parts[0][1].uri,platform==='web'?display:'display')
  assert.equal(a.temps.length,0)
 })
 test(`${platform}: 큰 GIF는 원본을 변환하거나 업로드하지 않고 거절한다`,async()=>{
  const a=adapter(platform,{media:{fileSize:6*1024*1024,extension:'gif'},blob:{}})
  await assert.rejects(a.files.upload('id','PHOTO'),error=>error.status===413);assert.equal(a.parts.length,0)
 })
 test(`${platform}: 받은 바이트는 서버 ID로 기존 기기 보관소에 저장한다`,async()=>{
  const a=adapter(platform,{}),bytes=new Uint8Array([137,80,78,71,13,10,26,10,0])
  await a.files.save('server-id',bytes)
  assert.equal(a.writes[0].metadata.mediaFileId,'server-id');assert.equal(a.writes[0].metadata.extension,'png')
  assert.equal(a.writes[0].metadata.fileSize,bytes.length)
  assert.equal(a.seeds[0].id,'server-id');assert.equal(a.seeds[0].uri,'cached-image')
  if(platform==='native')assert.equal(a.temps[0].deleted,true)
 })
}

for(const platform of ['web','native']){
 test(`${platform}: 5MB 를 넘는 불투명 PDF 쪽 PNG 는 올릴 때만 JPEG 로 낮추고 기기 원본은 그대로 둔다`,async()=>{
  const original={uri:'original',size:7*1024*1024}
  const a=adapter(platform,{media:{fileSize:7*1024*1024,extension:'png',mimeType:'image/png',width:3000,height:2121,opaque:true},blob:original})
  await a.files.upload('id','STICKER')
  assert.equal(a.jpegCalls.length,1);assert.deepEqual(a.jpegCalls[0].options,{width:3000,height:2121,maxBytes:plan.SHARE_MAX_BYTES})
  assert.equal(a.jpegCalls[0].source,platform==='web'?original:'original')
  if(platform==='web'){assert.equal(a.parts[0][2],'image.jpg');assert.deepEqual(a.parts[0][1],{jpeg:true})}
  else{const {bytes,...part}=a.parts[0][1];assert.deepEqual(part,{uri:'jpeg-uri',type:'image/jpeg',name:'image.jpg'});assert.equal(typeof bytes,'function')}
  assert.equal(a.parts[1][1],'STICKER');assert.equal(a.writes.length,0)
 })
 test(`${platform}: 5MB 이하이거나 투명할 수 있는 그림은 JPEG 로 바꾸지 않는다`,async()=>{
  const small=adapter(platform,{media:{fileSize:2*1024*1024,extension:'png',mimeType:'image/png',width:3000,height:2121,opaque:true},blob:{uri:'small'}})
  await small.files.upload('id','STICKER');assert.equal(small.jpegCalls.length,0)
  const sticker=adapter(platform,{media:{fileSize:7*1024*1024,extension:'png',mimeType:'image/png',width:3000,height:2121},blob:{uri:'big'}})
  await assert.rejects(sticker.files.upload('id','STICKER'),error=>error.status===413);assert.equal(sticker.jpegCalls.length,0)
 })
}

test('native: 업로드 파일 칸은 expo/fetch 가 읽을 수 있게 bytes() 로 파일 내용을 내준다(uri 만 있으면 보내기 전에 실패)',async()=>{
 const a=adapter('native',{media:{fileSize:100,extension:'png',mimeType:'image/png',width:20,height:10},blob:{uri:'file:///sticker.png'}})
 await a.files.upload('id','STICKER')
 const part=a.parts[0][1];assert.equal(part.uri,'file:///sticker.png');assert.equal(part.name,'image.png');assert.equal(part.type,'image/png')
 assert.equal(typeof part.bytes,'function')
})

test('JPEG 로 낮출 때는 품질을 먼저 낮추고, 그래도 크면 크기를 줄이며, 투명할 수 있는 그림은 대상이 아니다',()=>{
 const attempts=shareJpegAttempts()
 assert.equal(attempts[0].scale,1);assert.ok(attempts.every((item,i)=>i===0||item.scale<attempts[i-1].scale))
 assert.ok(attempts[0].qualities[0]>=0.9);assert.ok(attempts[0].qualities.every((q,i,all)=>i===0||q<all[i-1]))
 assert.equal(plan.needsShareJpeg({opaque:true,extension:'png',fileSize:plan.SHARE_MAX_BYTES+1+64*1024}),true)
 assert.equal(plan.needsShareJpeg({opaque:true,extension:'png',fileSize:plan.SHARE_MAX_BYTES}),false)
 assert.equal(plan.needsShareJpeg({opaque:true,extension:'gif',fileSize:9e6}),false)
 assert.equal(plan.needsShareJpeg({extension:'png',fileSize:9e6}),false)
})
