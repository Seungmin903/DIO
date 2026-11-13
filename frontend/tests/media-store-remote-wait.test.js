import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import * as references from '../src/editor/utils/mediaReferences.js'
import * as policy from '../src/editor/utils/mediaPolicy.js'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'))

// 공유 사진을 서버에서 받는 동안 화면이 먼저 읽어도 '찾을 수 없어요'가 아니라 받기가 끝날 때까지 기다리는지 본다.
function store(get){
 const code=expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/services/mediaStore.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
 const module={exports:{}}
 new Function('require','module','exports',code)(name=>
  name==='react-native'?{Platform:{OS:'native'}}
  :name==='expo-crypto'?{randomUUID:()=>'uuid'}
  :name.endsWith('/mediaRepository')?{get}
  :name.endsWith('mediaImport.js')?{createMediaImporter:()=>async()=>[]}
  :name.endsWith('mediaPolicy.js')?policy
  :name.endsWith('mediaReferences.js')?references
  :name.endsWith('mediaRetry.js')?{retryRemoteMedia:async()=>false}
  :assert.fail(`unexpected import ${name}`),module,module.exports)
 return module.exports
}
const notFound=()=>new policy.MediaError('MEDIA_NOT_FOUND','저장된 원본 이미지를 찾을 수 없어요.')
const stored=id=>({media:{mediaFileId:id},blob:{uri:`file:${id}`},displayBlob:null})

test('받는 중인 공유 사진은 받기가 끝난 뒤 다시 읽어 표시한다',async()=>{
 let saved=false,finish
 const s=store(async id=>{if(!saved)throw notFound();return stored(id)})
 s.trackRemoteMedia('a',new Promise(resolve=>{finish=resolve}))
 const shown=s.mediaRegistry.ensure('a')
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(s.mediaRegistry.get('a').status,'loading')
 saved=true;finish()
 assert.equal((await shown).uri,'file:a')
})

test('받기에 실패하면 찾을 수 없음 대신 받기 오류를 알린다',async()=>{
 const s=store(async()=>{throw notFound()})
 s.trackRemoteMedia('b',Promise.reject(Object.assign(Error('이미지 서버에 연결하지 못했어요.'),{code:'NETWORK_ERROR'})))
 await assert.rejects(s.mediaRegistry.ensure('b'),error=>error.code==='NETWORK_ERROR')
 assert.equal(s.mediaRegistry.get('b').error.code,'NETWORK_ERROR')
})

test('받는 중이 아닌 사진은 기존처럼 바로 찾을 수 없음으로 끝난다',async()=>{
 const s=store(async()=>{throw notFound()})
 await assert.rejects(s.mediaRegistry.ensure('c'),error=>error.code==='MEDIA_NOT_FOUND')
})

test('실패했던 받기가 나중에 성공으로 바뀌면 예전 오류를 다시 보이지 않는다',async()=>{
 const s=store(async()=>{throw notFound()})
 s.trackRemoteMedia('d',Promise.reject(Object.assign(Error('예전 오류'),{code:'NETWORK_ERROR'})))
 s.trackRemoteMedia('d',Promise.resolve())
 await new Promise(resolve=>setImmediate(resolve))
 await assert.rejects(s.mediaRegistry.ensure('d'),error=>error.code==='MEDIA_NOT_FOUND')
})

test('세션 정리는 자기가 남긴 실패 기록만 지우고 다른 받기는 건드리지 않는다',async()=>{
 const s=store(async()=>{throw notFound()})
 const old=Promise.reject(Object.assign(Error('예전 오류'),{code:'NETWORK_ERROR'}));old.catch(()=>{})
 s.trackRemoteMedia('e',old)
 s.forgetRemoteMedia('e',old)
 await assert.rejects(s.mediaRegistry.ensure('e'),error=>error.code==='MEDIA_NOT_FOUND')
 const other=Promise.reject(Object.assign(Error('다른 세션 오류'),{code:'NETWORK_ERROR'}));other.catch(()=>{})
 s.trackRemoteMedia('f',other)
 s.forgetRemoteMedia('f',old)
 await assert.rejects(s.mediaRegistry.ensure('f'),error=>error.message==='다른 세션 오류')
})
