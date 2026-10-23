import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { pngFileName, pngSaveError, createSaveGate } from '../src/editor/utils/pngFileSave.js'
import { savePngFile } from '../src/editor/utils/savePngFile.web.js'

const result = { blob: new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], {type:'image/png'}) }

test('파일명은 제목·페이지·기기 현지 시각으로 고정하고 경로/제어문자를 제거한다', () => {
  const name=pngFileName('여행/일기:*?\n',3,new Date(2026,9,20,14,2,3,4))
  assert.equal(name,'DIO_여행_일기_____p03_20261020_140203_004.png')
  assert.ok(!/[<>:"/\\|?*\u0000-\u001f]/.test(name))
})

test('저장 중 동시 실행은 차단하고 실패 후 재시도를 허용한다', async () => {
  const gate=createSaveGate(); let release, count=0
  const first=gate(()=>{count++;return new Promise((resolve)=>{release=resolve})})
  assert.deepEqual(await gate(()=>{count++}),{status:'busy'})
  release({status:'saved'});await first;assert.equal(count,1)
  await assert.rejects(gate(()=>{throw Error('failed')}))
  assert.deepEqual(await gate(()=>({status:'cancelled'})),{status:'cancelled'})
})

test('웹 저장 완료는 write와 close가 모두 끝난 뒤에만 반환한다', async (t) => {
  const previous=globalThis.window;t.after(()=>{globalThis.window=previous})
  let written,closed=false,finish
  globalThis.window={showSaveFilePicker:async(options)=>{
    assert.equal(options.suggestedName,'test.png')
    return {name:'chosen.png',createWritable:async()=>({write:async(blob)=>{written=blob},close:()=>new Promise((resolve)=>{finish=()=>{closed=true;resolve()}})})}
  }}
  let settled=false
  const saving=savePngFile(result,'test.png').then((value)=>{settled=true;return value})
  await new Promise(setImmediate)
  assert.equal(written,result.blob);assert.equal(settled,false)
  finish();assert.deepEqual(await saving,{status:'saved',fileName:'chosen.png'});assert.equal(closed,true)
})

test('웹 취소는 성공이 아니며 쓰기 실패는 abort 후 재시도 가능한 오류로 남긴다', async (t) => {
  const previous=globalThis.window;t.after(()=>{globalThis.window=previous})
  globalThis.window={showSaveFilePicker:async()=>{throw Object.assign(Error('cancel'),{name:'AbortError'})}}
  assert.deepEqual(await savePngFile(result,'test.png'),{status:'cancelled'})
  let aborted=false
  globalThis.window={showSaveFilePicker:async()=>({createWritable:async()=>({write:async()=>{throw Error('quota')},abort:async()=>{aborted=true}})})}
  await assert.rejects(savePngFile(result,'test.png'),/quota/);assert.equal(aborted,true)
})

test('웹 다운로드 fallback은 저장 완료 대신 시작 상태를 반환하고 별도 URL을 해제한다', async (t) => {
  const previous={window:globalThis.window,document:globalThis.document,setTimeout:globalThis.setTimeout}
  t.after(()=>Object.assign(globalThis,previous))
  let clicked=0,removed=0,cleanup
  const anchor={click(){clicked++},remove(){removed++}}
  globalThis.window={};globalThis.document={createElement:()=>anchor,body:{appendChild(){}}}
  globalThis.setTimeout=(action)=>{cleanup=action}
  const value=await savePngFile(result,'download.png')
  assert.equal(value.status,'download-started');assert.equal(clicked,1);assert.equal(removed,1);assert.equal(anchor.download,'download.png')
  assert.equal((await fetch(anchor.href)).status,200);cleanup();await assert.rejects(fetch(anchor.href))
})

test('저장 공간과 권한 오류 안내를 구분한다', () => {
  assert.match(pngSaveError({code:'ENOSPC'}),/공간/)
  assert.match(pngSaveError({name:'Error',message:'permission denied'}),/다른 폴더/)
})

test('사진첩 저장 완료를 기다리고 권한·실패 처리와 캐시/원본 보존을 구분한다', async (t) => {
  const files=new Map([['original',{name:'capture.png',size:8}]])
  let permission={granted:true,canAskAgain:true}, grantOnRequest=false, requested=0, copyFails=false, saveFails=false, finish, saves=0, nextId=0
  const folders=new Set()
  class Directory {
    constructor(_,name){this.uri='file:///cache/'+name}
    create(){folders.add(this.uri)}
    delete(){folders.delete(this.uri);for(const key of files.keys())if(key.startsWith(this.uri+'/'))files.delete(key)}
  }
  class File {
    constructor(...parts){this.uri=parts.map(p=>p.uri||p).join('/')}
    get exists(){return files.has(this.uri)}
    get size(){return files.get(this.uri)?.size}
    open(){return {readBytes:()=>new Uint8Array([137,80,78,71,13,10,26,10]),close(){}}}
    async copy(destination){files.set(destination.uri,{size:8});if(copyFails)throw Error('copy failed')}
  }
  globalThis.__pngSaveNative={File,Directory,Paths:{cache:'file:///cache'},FileMode:{ReadOnly:'r'},randomUUID:()=>String(nextId++),
    getPermissionsAsync:async(writeOnly,granular)=>{assert.equal(writeOnly,true);assert.deepEqual(granular,[]);return permission},
    requestPermissionsAsync:async(writeOnly,granular)=>{assert.equal(writeOnly,true);assert.deepEqual(granular,[]);requested++;return grantOnRequest ? {granted:true,canAskAgain:true} : permission},
    saveToLibraryAsync:async(uri)=>{assert.ok(uri.endsWith('/test.png'));assert.ok(files.has(uri));saves++;if(saveFails)throw Error('disk full');await new Promise(resolve=>{finish=resolve})},
  }
  const sources={
    'expo-file-system':'export const {File,Directory,Paths,FileMode}=globalThis.__pngSaveNative',
    'expo-crypto':'export const {randomUUID}=globalThis.__pngSaveNative',
    'expo-media-library/legacy':'export const {getPermissionsAsync,requestPermissionsAsync,saveToLibraryAsync}=globalThis.__pngSaveNative',
  }
  const hooks=registerHooks({resolve(s,c,next){return sources[s]?{url:'png-photos:'+s,shortCircuit:true}:next(s,c)},load(u,c,next){return u.startsWith('png-photos:')?{format:'module',source:sources[u.slice(11)],shortCircuit:true}:next(u,c)}})
  t.after(()=>{hooks.deregister();delete globalThis.__pngSaveNative})
  const {savePngFile:nativeSave}=await import('../src/editor/utils/savePngFile.native.js')
  let settled=false
  const saving=nativeSave({uri:'original'},'test.png').then(v=>{settled=true;return v})
  await new Promise(setImmediate)
  assert.equal(settled,false);assert.equal(folders.size,1)
  finish();assert.deepEqual(await saving,{status:'saved',fileName:'test.png',destination:'photos'})
  assert.equal(folders.size,0);assert.equal(files.size,1);assert.ok(files.has('original'))
  permission={granted:false,canAskAgain:false}
  await assert.rejects(nativeSave({uri:'original'},'test.png'),{code:'PHOTO_PERMISSION_BLOCKED'})
  assert.equal(requested,0);assert.equal(saves,1);assert.equal(folders.size,0)
  permission={granted:false,canAskAgain:true}
  await assert.rejects(nativeSave({uri:'original'},'test.png'),{code:'PHOTO_PERMISSION_DENIED'})
  assert.equal(requested,1);assert.equal(saves,1)
  grantOnRequest=true
  const grantedSave=nativeSave({uri:'original'},'test.png')
  await new Promise(setImmediate);finish();await grantedSave
  assert.equal(requested,2);assert.equal(folders.size,0);assert.equal(files.size,1)
  permission={granted:true,canAskAgain:true};saveFails=true
  await assert.rejects(nativeSave({uri:'original'},'test.png'),/disk full/)
  assert.equal(folders.size,0);assert.equal(files.size,1)
  copyFails=true;saveFails=false
  await assert.rejects(nativeSave({uri:'original'},'test.png'),/copy failed/)
  assert.equal(folders.size,0);assert.equal(files.size,1);assert.ok(files.has('original'))
})

test('사진첩 권한 거부와 설정이 필요한 차단 상태의 안내를 구분한다', () => {
  assert.match(pngSaveError({code:'PHOTO_PERMISSION_DENIED'}),/다시 저장/)
  assert.match(pngSaveError({code:'PHOTO_PERMISSION_BLOCKED'}),/설정/)
})
