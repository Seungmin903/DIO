import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { savePdfFile } from '../src/editor/utils/savePdfFile.web.js'
import { createPdfShareService, PDF_SHARE_TTL, pdfSaveMessage, pdfSaveError } from '../src/editor/utils/pdfFileSave.js'

const output = () => ({ uri:'blob:original',blob:new Blob(['%PDF-1.7\nqa'],{type:'application/pdf'}),fileName:'DIO_test_p01_20261020_170000_001.pdf' })

test('PDF 웹 picker는 즉시 열고 write/close 완료 후만 저장 완료를 반환한다',async t=>{
 const old=globalThis.window;t.after(()=>{globalThis.window=old})
 let opened=false,finish,written
 globalThis.window={showSaveFilePicker:async options=>{opened=true;assert.equal(options.suggestedName,output().fileName);assert.deepEqual(options.types[0].accept,{'application/pdf':['.pdf']});return {name:'chosen.pdf',createWritable:async()=>({write:async blob=>{written=blob},close:()=>new Promise(ok=>{finish=ok})})}}}
 const result=output();let completed=false;const job=savePdfFile(result).then(r=>{completed=true;return r})
 assert.equal(opened,true);await new Promise(setImmediate);assert.equal(written,result.blob);assert.equal(completed,false)
 finish();assert.deepEqual(await job,{status:'saved',fileName:'chosen.pdf'})
})

test('PDF 웹 취소·쓰기 실패는 재생성 없이 같은 파일로 재시도한다',async t=>{
 const old=globalThis.window;t.after(()=>{globalThis.window=old});const result=output()
 globalThis.window={showSaveFilePicker:async()=>{throw Object.assign(new Error('cancel'),{name:'AbortError'})}}
 assert.deepEqual(await savePdfFile(result),{status:'cancelled'})
 let aborts=0
 globalThis.window={showSaveFilePicker:async()=>({createWritable:async()=>({write:async()=>{throw Error('ENOSPC')},abort:async()=>{aborts++}})})}
 await assert.rejects(savePdfFile(result),/ENOSPC/);assert.equal(aborts,1)
 globalThis.window={showSaveFilePicker:async()=>({createWritable:async()=>({write:async b=>assert.equal(b,result.blob),close:async()=>{}})})}
 assert.equal((await savePdfFile(result)).status,'saved')
})

test('PDF 웹 다운로드는 독립 URL을 60초 유예하고 성공 대신 시작을 반환한다',async t=>{
 const old={window:globalThis.window,document:globalThis.document,setTimeout:globalThis.setTimeout};t.after(()=>Object.assign(globalThis,old))
 let anchor,release,delay
 globalThis.window={};globalThis.document={body:{appendChild(){}},createElement:()=>anchor={click(){},remove(){}}};globalThis.setTimeout=(fn,ms)=>{release=fn;delay=ms}
 const result=output();const saved=await savePdfFile(result);assert.equal(saved.status,'download-started');assert.equal(anchor.download,result.fileName);assert.equal(delay,60000)
 assert.equal((await fetch(anchor.href)).status,200);release();await assert.rejects(fetch(anchor.href));assert.equal(result.uri,'blob:original')
})

test('공유 중 복사본은 보호하고 반환 후 24시간 유지하며 원본을 정리하지 않는다',async()=>{
 let time=1000,finish;const entries=new Map(),deleted=[]
 const service=createPdfShareService({now:()=>time,isAvailable:async()=>true,
 list:async()=>[...entries.values()],remove:async e=>{deleted.push(e.uri);entries.delete(e.uri)},
 createCopy:async(r,expiresAt)=>{const e={uri:'file:///share/job/a.pdf',cacheKey:'file:///share/job',expiresAt};entries.set(e.cacheKey,{...e,uri:e.cacheKey});return e},
 setExpiry:async(e,expiresAt)=>{entries.get(e.cacheKey).expiresAt=expiresAt},
 share:async(uri,options)=>{assert.equal(uri,'file:///share/job/a.pdf');assert.equal(options.mimeType,'application/pdf');assert.equal(options.UTI,'com.adobe.pdf');await new Promise(ok=>{finish=ok})}})
 const job=service.save(output());await new Promise(setImmediate);time+=PDF_SHARE_TTL+1;await service.cleanup();assert.equal(deleted.length,0)
 finish();assert.equal((await job).status,'share-finished');assert.equal(entries.get('file:///share/job').expiresAt,time+PDF_SHARE_TTL)
 await service.cleanup();assert.equal(deleted.length,0);time+=PDF_SHARE_TTL+1;await service.cleanup();assert.deepEqual(deleted,['file:///share/job'])
})

test('공유 불가·확인 가능한 취소·공유 실패를 저장 성공으로 바꾸지 않는다',async()=>{
 let available=false,created=0,mode='cancel',expiry=0
 const service=createPdfShareService({list:async()=>[],remove:async()=>{},isAvailable:async()=>available,
 createCopy:async()=>{created++;return {uri:'copy'}},setExpiry:async()=>{expiry++},share:async()=>{throw Object.assign(Error('share error'),{name:mode==='cancel'?'AbortError':'Error'})}})
 await assert.rejects(service.save(output()),{code:'EXPORT_PDF_SHARE_UNAVAILABLE'});assert.equal(created,0)
 available=true;assert.equal((await service.save(output())).status,'cancelled');assert.equal(expiry,1)
 mode='fail';await assert.rejects(service.save(output()),/share error/);assert.equal(expiry,2)
 assert.match(pdfSaveMessage({status:'share-finished'}),/선택한 앱에서 결과/);assert.match(pdfSaveError({code:'EXPORT_PDF_SHARE_UNAVAILABLE'}),/웹에서/)
})

test('네이티브는 PDF 복사본만 공유하고 실패 복사와 만료 캐시를 정리한다',async t=>{
 const data=new Map([['file:///original.pdf',new TextEncoder().encode('%PDF-1.7\nqa')]]),dirs=new Set();let next=0,shared=0,copyFails=false,finish
 class Directory{
  constructor(...parts){this.uri=parts.map(x=>x.uri??x).join('/')}
  get exists(){return dirs.has(this.uri)}get name(){return this.uri.split('/').at(-1)}
  create(){dirs.add(this.uri)}
  list(){return [...dirs].filter(k=>k.startsWith(this.uri+'/')&&!k.slice(this.uri.length+1).includes('/')).map(k=>new Directory(k))}
  delete(){for(const k of [...dirs])if(k===this.uri||k.startsWith(this.uri+'/'))dirs.delete(k);for(const k of [...data.keys()])if(k.startsWith(this.uri+'/'))data.delete(k)}
 }
 class File{
  constructor(...parts){this.uri=parts.map(x=>x.uri??x).join('/')}
  get exists(){return data.has(this.uri)}get size(){return data.get(this.uri)?.length??0}
  create(){data.set(this.uri,new Uint8Array())}write(s){data.set(this.uri,new TextEncoder().encode(s))}async text(){return new TextDecoder().decode(data.get(this.uri))}
  open(){let closed=false;return {readBytes:async n=>{await Promise.resolve();assert.equal(closed,false,'PDF 헤더 읽기 완료 전 핸들 종료');return data.get(this.uri).slice(0,n)},close(){closed=true}}}
  async copy(target){data.set(target.uri,data.get(this.uri).slice());if(copyFails)throw Error('copy failed')}
 }
 globalThis.__pdfNative={Directory,File,FileMode:{ReadOnly:'r'},Paths:{cache:'file:///cache'},randomUUID:()=>String(next++),isAvailableAsync:async()=>true,
 shareAsync:async(uri,options)=>{shared++;assert.ok(data.has(uri));assert.ok(uri.endsWith('/named.pdf'));assert.equal(options.UTI,'com.adobe.pdf');await new Promise(ok=>{finish=ok})}}
 const sources={'expo-file-system':'export const {Directory,File,FileMode,Paths}=globalThis.__pdfNative','expo-crypto':'export const {randomUUID}=globalThis.__pdfNative','expo-sharing':'export const {isAvailableAsync,shareAsync}=globalThis.__pdfNative'}
 const prefix='pdf-save:';const hooks=registerHooks({resolve(s,c,next){return sources[s]?{url:prefix+s,shortCircuit:true}:next(s,c)},load(u,c,next){return u.startsWith(prefix)?{format:'module',source:sources[u.slice(prefix.length)],shortCircuit:true}:next(u,c)}})
 t.after(()=>{hooks.deregister();delete globalThis.__pdfNative})
 const native=await import('../src/editor/utils/savePdfFile.native.js')
 const result={uri:'file:///original.pdf',fileName:'named.pdf'};const job=native.savePdfFile(result);await new Promise(setImmediate);assert.equal(shared,1);assert.ok(data.has('file:///original.pdf'));finish();assert.equal((await job).status,'share-finished')
 const leases=[...data.keys()].filter(k=>k.endsWith('lease.json'));assert.equal(leases.length,1);assert.ok(JSON.parse(new TextDecoder().decode(data.get(leases[0]))).expiresAt>Date.now())
 data.set(leases[0],new TextEncoder().encode('{"expiresAt":0}'));assert.equal((await native.cleanupPdfShareCache()).removed,1);assert.ok(data.has('file:///original.pdf'))
 copyFails=true;await assert.rejects(native.savePdfFile(result),/copy failed/);assert.equal(shared,1);assert.equal([...dirs].filter(k=>k.includes('/export-')).length,0)
 await assert.rejects(native.savePdfFile({...result,fileName:'../bad.pdf'}),{code:'EXPORT_PDF_INPUT_INVALID'})
})
