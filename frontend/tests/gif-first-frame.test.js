import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { GifWriter } from 'omggif'
import UPNG from 'upng-js'
import { gifFirstFramePng } from '../src/editor/utils/gifFirstFrame.js'
import { exportImage } from '../src/editor/utils/exportImage.web.js'
import { selectExportRaster } from '../src/editor/utils/exportSampling.js'

function fixture({ transparent = false, offset = false } = {}) {
  const buffer = new Uint8Array(4096)
  const writer = new GifWriter(buffer, 4, 4, { palette: [0xff0000, 0x0000ff], loop: 0 })
  writer.addFrame(offset ? 1 : 0, offset ? 1 : 0, offset ? 2 : 4, offset ? 2 : 4, new Uint8Array(offset ? 4 : 16), { delay: 1, ...(transparent ? { transparent: 1 } : {}) })
  writer.addFrame(0, 0, 4, 4, new Uint8Array(16).fill(1), { delay: 1 })
  return buffer.slice(0, writer.end())
}
function decode(png) {
  const data = UPNG.decode(png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength))
  return { width: data.width, height: data.height, rgba: new Uint8Array(UPNG.toRGBA8(data)[0]) }
}

test('반복 추출해도 두 번째 파란 프레임 대신 첫 빨간 프레임이며 원본은 불변이다', () => {
  const bytes = fixture(), original = bytes.slice()
  const first = gifFirstFramePng(bytes), again = gifFirstFramePng(bytes)
  assert.deepEqual(first.png, again.png)
  const result = decode(first.png)
  assert.equal(result.width, 4)
  for (let i = 0; i < result.rgba.length; i += 4) assert.deepEqual([...result.rgba.slice(i, i + 4)], [255, 0, 0, 255])
  assert.deepEqual(bytes, original)
})

test('첫 프레임의 오프셋과 투명 여백을 논리 화면 크기로 유지한다', () => {
  const result = decode(gifFirstFramePng(fixture({ transparent: true, offset: true })).png)
  assert.deepEqual([result.width, result.height], [4, 4])
  assert.equal(result.rgba[3], 0)
  assert.deepEqual([...result.rgba.slice(20, 24)], [255, 0, 0, 255])
  assert.equal(result.rgba[63], 0)
})

test('출력 요구량만큼 축소하고 확대하지 않는다', () => {
  const bytes = fixture()
  assert.deepEqual(decode(gifFirstFramePng(bytes, { size: { width: 2, height: 2 } }).png).rgba, new Uint8Array([255,0,0,255,255,0,0,255,255,0,0,255,255,0,0,255]))
  assert.equal(gifFirstFramePng(bytes, { size: { width: 100, height: 100 } }).width, 4)
})

test('손상되거나 과도한 논리 크기의 GIF는 할당 전에 거절한다', () => {
  assert.throws(() => gifFirstFramePng(fixture().slice(0, 24)), { code: 'EXPORT_GIF_DECODE_FAILED' })
  const bytes = fixture(); bytes[6] = 255; bytes[7] = 255
  assert.throws(() => gifFirstFramePng(bytes), { code: 'EXPORT_GIF_TOO_LARGE' })
})

test('GIF는 표시본이 충분해도 원본으로 첫 프레임을 읽는다', () => {
  const original = fixture()
  const selected = selectExportRaster({ blob: original, displayBlob: 'wrong-poster', media: { mimeType: 'image/gif', width: 4, height: 4, display: { width: 4, height: 4 } } }, [{ w: 2, h: 2 }], { width: 4, height: 4, pixelWidth: 4, pixelHeight: 4 })
  assert.equal(selected.blob, original)
})

test('웹 출력은 정지 PNG URL을 만들고 해제하며 원본은 그대로 둔다', async () => {
  const bytes = fixture(), blob = new Blob([bytes], { type: 'image/gif' })
  const result = await exportImage({ blob })
  const response = await fetch(result.uri)
  assert.equal(response.headers.get('content-type'), 'image/png')
  assert.deepEqual([...decode(new Uint8Array(await response.arrayBuffer())).rgba.slice(0, 4)], [255, 0, 0, 255])
  result.dispose()
  await assert.rejects(fetch(result.uri))
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes)
})

test('배포 기본 GIF 스티커 전체의 첫 프레임을 PNG로 변환한다', async () => {
  const directory = new URL('../src/assets/stickers/noto/', import.meta.url)
  const files = (await readdir(directory)).filter((name) => name.endsWith('.gif'))
  assert.ok(files.length >= 36)
  for (const name of files) {
    const bytes = await readFile(new URL(name, directory))
    const result = decode(gifFirstFramePng(bytes).png)
    assert.ok(result.width > 0 && result.height > 0, name)
    assert.equal(result.rgba.length, result.width * result.height * 4, name)
  }
})

test('네이티브는 첫 프레임 임시 PNG만 생성·삭제하고 쓰기 실패 시 정리한다', async (t) => {
  const { registerHooks } = await import('node:module')
  const files = new Map()
  let failWrite = false
  class File {
    constructor(...parts) { this.uri = parts.join('/') }
    get exists() { return files.has(this.uri) }
    create() { files.set(this.uri, null) }
    write(bytes) { if (failWrite) throw new Error('disk full'); files.set(this.uri, bytes) }
    delete() { files.delete(this.uri) }
  }
  globalThis.__gifExport = { File, Paths: { cache: 'file:///cache' } }
  const sources = {
    'expo-file-system': 'export const {File,Paths}=globalThis.__gifExport;export const FileMode={ReadOnly:"r"}',
    'expo-crypto': 'export const randomUUID=()=>"test-gif"',
    'react-native': 'export const Image={}',
    'expo-image-manipulator': 'export const ImageManipulator={},SaveFormat={JPEG:"jpeg",PNG:"png"}',
  }
  const hooks = registerHooks({
    resolve(s,c,next) { return sources[s] ? {url:'gif-native:'+s,shortCircuit:true} : next(s,c) },
    load(u,c,next) { return u.startsWith('gif-native:') ? {format:'module',source:sources[u.slice(11)],shortCircuit:true} : next(u,c) },
  })
  t.after(() => { hooks.deregister(); delete globalThis.__gifExport })
  const { exportImage: nativeExport } = await import('../src/editor/utils/exportImage.native.js')
  const original = fixture()
  let closed = 0
  const blob = { uri:'file:///original.gif', open:()=>({readBytes:n=>original.slice(0,n),close:()=>closed++}), bytes:async()=>original }
  const result = await nativeExport({blob})
  assert.equal(closed,1)
  assert.deepEqual([...decode(files.get(result.uri)).rgba.slice(0,4)],[255,0,0,255])
  result.dispose(); assert.equal(files.size,0)
  failWrite = true
  await assert.rejects(nativeExport({blob}), /disk full/)
  assert.equal(files.size,0)
  assert.deepEqual(original,fixture())
})

test('로컬 팔레트와 인터레이스 첫 프레임을 원래 행 순서로 복원한다', () => {
  const buffer = new Uint8Array(4096)
  const writer = new GifWriter(buffer, 2, 8)
  const order = [0,4,2,6,1,3,5,7]
  const pixels = Uint8Array.from(order.flatMap((y) => [y % 2, y % 2]))
  writer.addFrame(0,0,2,8,pixels,{palette:[0xff0000,0x0000ff]})
  const bytes = buffer.slice(0,writer.end())
  assert.equal(bytes[13],0x2c)
  bytes[22] |= 0x40
  const result = decode(gifFirstFramePng(bytes).png)
  for(let y=0;y<8;y++) assert.deepEqual([...result.rgba.slice(y*8,y*8+4)], y%2 ? [0,0,255,255] : [255,0,0,255])
})

function insertBytes(bytes, at, extra) {
  const result = new Uint8Array(bytes.length + extra.length)
  result.set(bytes.subarray(0, at)); result.set(extra, at); result.set(bytes.subarray(at), at + extra.length)
  return result
}

test('Plain Text와 알 수 없는 확장을 건너뛰되 잘린 하위 블록은 거부한다', () => {
  const bytes = fixture(), original = bytes.slice()
  const headerEnd = 13 + 6
  const plainText = [0x21, 0x01, 12, 0,0,0,0,4,0,4,0,1,1,0,1, 1,65,0]
  const unknown = [0x21, 0xce, 2,0x2c,0x21, 1,0xff,0]
  const withExtensions = insertBytes(bytes, headerEnd, [...plainText,...unknown])
  assert.deepEqual(decode(gifFirstFramePng(withExtensions).png).rgba, decode(gifFirstFramePng(bytes).png).rgba)
  assert.deepEqual(bytes,original)
  assert.throws(() => gifFirstFramePng(insertBytes(bytes.slice(0,headerEnd),headerEnd,[0x21,0xce,255,0])), {code:'EXPORT_GIF_DECODE_FAILED'})
})

test('Plain Text에 적용된 투명도 제어가 뒤 이미지로 새지 않는다', () => {
  const buffer = new Uint8Array(4096)
  const writer = new GifWriter(buffer, 2, 2, {palette:[0xff0000,0x0000ff]})
  writer.addFrame(0,0,2,2,new Uint8Array(4).fill(1),{transparent:1})
  const bytes=buffer.slice(0,writer.end())
  assert.equal(bytes[27],0x2c)
  const modified=insertBytes(bytes,27,[0x21,0x01,12,0,0,0,0,2,0,2,0,1,1,0,1,0])
  assert.deepEqual([...decode(gifFirstFramePng(modified).png).rgba.slice(0,4)],[0,0,255,255])
})

test('투명 인덱스가 없는 부분 프레임도 바깥 여백을 투명하게 유지한다', () => {
  const result = decode(gifFirstFramePng(fixture({offset:true})).png)
  assert.equal(result.rgba[3],0)
  assert.equal(result.rgba[63],0)
  assert.deepEqual([...result.rgba.slice(20,24)],[255,0,0,255])
})

test('축소는 색 면적을 평균내고 반투명 가장자리에서 색이 어두워지지 않는다', () => {
  const buffer = new Uint8Array(4096)
  const writer = new GifWriter(buffer, 2, 2, {palette:[0xff0000,0x0000ff]})
  writer.addFrame(0,0,2,2,new Uint8Array([0,1,0,1]))
  const mixed = decode(gifFirstFramePng(buffer.slice(0,writer.end()),{size:{width:1,height:1}}).png)
  assert.deepEqual([...mixed.rgba],[128,0,128,255])
  const transparentBuffer=new Uint8Array(4096)
  const transparentWriter=new GifWriter(transparentBuffer,2,2,{palette:[0xff0000,0]})
  transparentWriter.addFrame(0,0,2,2,new Uint8Array([0,1,0,1]),{transparent:1})
  const edge=decode(gifFirstFramePng(transparentBuffer.slice(0,transparentWriter.end()),{size:{width:1,height:1}}).png)
  assert.deepEqual([...edge.rgba],[255,0,0,128])
})
