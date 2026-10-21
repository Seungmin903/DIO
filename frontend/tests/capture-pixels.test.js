import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { captureDimensions, pngDimensions, verifyCaptureDimensions } from '../src/editor/utils/capturePixels.js'

function header(width, height) {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  const data = new DataView(bytes.buffer)
  data.setUint32(8, 13); data.setUint32(12, 0x49484452)
  data.setUint32(16, width); data.setUint32(20, height)
  return bytes
}

test('iOS 1·2·3배와 Android는 같은 목표 픽셀을 요청한다', () => {
  // 프리셋 세 종류, 자유 영역, 전체 페이지 PNG, PDF 2배 페이지.
  for (const [pixelWidth, pixelHeight] of [[1080,1080],[1080,1350],[1080,1920],[802,606],[1188,840],[2376,1680]]) {
    const snapshot = { pixelWidth, pixelHeight }
    for (const ratio of [1,2,3]) {
      const ios = captureDimensions(snapshot, 'ios', ratio)
      assert.equal(Math.round(ios.width * ratio), pixelWidth)
      assert.equal(Math.round(ios.height * ratio), pixelHeight)
      assert.deepEqual(captureDimensions(snapshot, 'android', ratio), { width: pixelWidth, height: pixelHeight })
    }
  }
})

test('PNG IHDR의 실제 크기와 부분 버퍼 오프셋을 읽고 잘못된 헤더를 거부한다', () => {
  const padded = new Uint8Array(40); padded.set(header(1080,1920), 8)
  assert.deepEqual(pngDimensions(padded.subarray(8,32)), { width:1080, height:1920 })
  for (const bytes of [new Uint8Array(10),new Uint8Array(24),header(0,100)]) {
    assert.throws(() => pngDimensions(bytes), { code:'EXPORT_CAPTURE_INVALID' })
  }
  assert.throws(() => verifyCaptureDimensions(header(2160,3840), {pixelWidth:1080,pixelHeight:1920}), {code:'EXPORT_CAPTURE_SIZE_MISMATCH'})
})

test('네이티브 캡처는 실제 헤더로 확인하고 실패·정상 해제 자원을 정리한다', async t => {
  let os = 'ios', ratio = 2, actual, captureFails = false, openFails = false, readFails = false
  const calls = [], releases = []
  let closed = 0
  globalThis.__capturePixelTest = {
    Platform: { get OS() {return os} }, PixelRatio: {get:()=>ratio}, FileMode: {ReadOnly:'r'},
    File: class {open() {if(openFails)throw Error('read failed'); return {readBytes:n=>{assert.equal(n,24);if(readFails)throw Error('read failed');return actual},close:()=>closed++}}},
    captureRef: async (_,options) => {
      calls.push(options)
      if(captureFails)throw Error('capture failed')
      if(!actual)actual=header(Math.round(options.width*(os==='ios'?ratio:1)),Math.round(options.height*(os==='ios'?ratio:1)))
      return 'file:///capture.png'
    }, releaseCapture:uri=>releases.push(uri),
  }
  const sources = {
    'react-native':'export const {Platform,PixelRatio}=globalThis.__capturePixelTest',
    'expo-file-system':'export const {File,FileMode}=globalThis.__capturePixelTest',
    'react-native-view-shot':'export const {captureRef,releaseCapture}=globalThis.__capturePixelTest',
  }
  const hooks=registerHooks({resolve(s,c,next){return sources[s]?{url:'capture-pixel:'+s,shortCircuit:true}:next(s,c)},load(u,c,next){return u.startsWith('capture-pixel:')?{format:'module',source:sources[u.slice(14)],shortCircuit:true}:next(u,c)}})
  t.after(()=>{hooks.deregister();delete globalThis.__capturePixelTest})
  const {capturePage}=await import('../src/editor/utils/capturePage.native.js')
  for(const platform of ['ios','android'])for(const density of [1,2,3]) {
    os=platform;ratio=density;actual=null
    const result=await capturePage({}, {pixelWidth:1080,pixelHeight:1920})
    assert.equal(result.width,1080);assert.equal(result.height,1920)
    const before=releases.length;result.dispose();result.dispose();assert.equal(releases.length,before+1)
  }
  os='ios';ratio=2;actual=header(2160,3840)
  let before=releases.length
  await assert.rejects(capturePage({}, {pixelWidth:1080,pixelHeight:1920}), {code:'EXPORT_CAPTURE_SIZE_MISMATCH'})
  assert.equal(releases.length,before+1)
  actual=new Uint8Array(24);before=releases.length
  await assert.rejects(capturePage({}, {pixelWidth:1080,pixelHeight:1920}), {code:'EXPORT_CAPTURE_INVALID'})
  assert.equal(releases.length,before+1)
  const closedBefore=closed;readFails=true;before=releases.length
  await assert.rejects(capturePage({}, {pixelWidth:1080,pixelHeight:1920}), /read failed/)
  assert.equal(closed,closedBefore+1);assert.equal(releases.length,before+1)
  readFails=false;openFails=true;before=releases.length
  await assert.rejects(capturePage({}, {pixelWidth:1080,pixelHeight:1920}), /read failed/)
  assert.equal(releases.length,before+1)
  openFails=false;captureFails=true;before=releases.length
  await assert.rejects(capturePage({}, {pixelWidth:1080,pixelHeight:1920}), /capture failed/)
  assert.equal(releases.length,before)
  assert.equal(calls[1].width,540)
})
