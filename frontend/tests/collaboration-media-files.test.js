import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {detectMediaType,checkDimensions} from '../src/editor/utils/mediaPolicy.js'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'))
function adapter(platform,stored){
 const writes=[],temps=[],parts=[],seeds=[]
 const repository={get:async()=>stored,decode:async()=>({width:20,height:10}),createDisplay:async()=>null,verifyDisplay:async()=>{},save:async(source,metadata)=>{writes.push({source,metadata});return 'cached-image'},dispose:async()=>{}}
 class File{constructor(_path,name){this.uri=`cache/${name}`;temps.push(this)}create(){}write(bytes){this.bytes=bytes}delete(){this.deleted=true}}
 class Form{append(...args){parts.push(args)}}
 const code=expo('@babel/core').transformSync(readFileSync(new URL(`../src/editor/services/canvasMediaFiles.${platform}.js`,import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
 const module={exports:{}}
 new Function('require','module','exports','FormData',code)(name=>name.endsWith('/mediaStore')?{mediaRegistry:{seed:(id,value)=>seeds.push({id,...value})}}:name.includes('mediaRepository')?repository:name.includes('mediaPolicy')?{detectMediaType,checkDimensions}:{File,Paths:{cache:'cache'}},module,module.exports,Form)
 return {files:module.exports.canvasMediaFiles,writes,temps,parts,seeds}
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
