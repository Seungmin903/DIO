import UPNG from 'upng-js'
import { Directory, File, Paths } from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
import { requireOptionalNativeModule } from 'expo-modules-core'
import { Platform } from 'react-native'
// SDK 57의 루트 saveToLibraryAsync는 폐기된 stub이므로 명시적인 legacy 진입점을 쓴다.
import { getPermissionsAsync, requestPermissionsAsync, saveToLibraryAsync } from 'expo-media-library/legacy'

// 페이지 GIF 만들기의 기기 입출력: 장면 PNG 파일, 찍은 페이지 픽셀 읽기, 완성 GIF 를 사진첩에 저장

export async function readBytes(file) {
  return typeof file.bytes === 'function' ? await file.bytes() : new Uint8Array(await file.arrayBuffer())
}

function cacheFile(bytes, extension) {
  const file = new File(Paths.cache, `dio-gif-${randomUUID()}.${extension}`)
  const dispose = () => { try { if (file.exists) file.delete() } catch {} }
  try {
    file.create()
    // 호출한 쪽이 곧바로 파일을 읽는다.
    file.writeSync(bytes)
    return { uri: file.uri, dispose }
  } catch (error) { dispose(); throw error }
}

export function pngResource(rgba, width, height) {
  return cacheFile(new Uint8Array(UPNG.encode([rgba.slice().buffer], width, height, 0)), 'png')
}

/** 찍은 페이지(PNG 파일)를 RGBA 픽셀로 */
export async function captureRgba(result) {
  const image = UPNG.decode((await readBytes(new File(result.uri))).buffer)
  return new Uint8Array(UPNG.toRGBA8(image)[0])
}

export function gifResult(bytes) {
  return { ...cacheFile(bytes, 'gif'), size: bytes.length }
}

// GIF 묶기(팔레트 · 번호 매기기 · LZW)는 modules/dio-gif-encoder 로 한다. 이 모듈이 들어가기 전 개발 빌드 · Expo Go 에는 없어 JS 로 묶는다
let gifEncoder = null
try { gifEncoder = requireOptionalNativeModule('DioGifEncoder') } catch { /* Expo Go */ }
// 없어도 조용히 JS 로 묶으므로, Android 개발 빌드에서는 네이티브 묶기를 못 쓰는 것을 알 수 있게 남긴다 (새 개발 빌드가 필요하다)
if (!gifEncoder && Platform.OS === 'android' && typeof __DEV__ !== 'undefined' && __DEV__) console.info?.('DioGifEncoder native module not in this build; GIF export encodes in JS')

/**
 * createGifAssembler 와 같은 순서로 쓰는 네이티브 GIF 묶기. 결과는 캐시 파일에 바로 쓴다. 모듈이 없으면 null.
 * finish() → { uri, size, dispose }. 도중에 그만두면 dispose() 로 파일까지 지운다.
 */
export function createNativeGifAssembler(width, height) {
  if (!gifEncoder) return null
  const file = new File(Paths.cache, `dio-gif-${randomUUID()}.gif`)
  const remove = () => { try { if (file.exists) file.delete() } catch {} }
  let id
  try { file.create(); id = gifEncoder.create(width, height, file.uri) } catch (error) { remove(); throw error }
  let open = true
  return {
    addColors: (rgba) => gifEncoder.addColors(id, rgba),
    addFrame: (rgba, delay, rect = { x: 0, y: 0, width, height }) => gifEncoder.addFrame(id, rgba, delay, rect.x, rect.y, rect.width, rect.height),
    finish() { open = false; return { uri: file.uri, size: gifEncoder.finish(id), dispose: remove } },
    dispose() { if (open) { open = false; try { gifEncoder.release(id) } catch {} } remove() },
  }
}

export async function saveGifFile(result, fileName) {
  // 사진 목록을 읽지 않고 추가 권한만 확인/요청한다.
  let permission = await getPermissionsAsync(true, [])
  if (!permission.granted && permission.canAskAgain) permission = await requestPermissionsAsync(true, [])
  if (!permission.granted) {
    const error = new Error('Photo library add permission denied')
    error.code = permission.canAskAgain ? 'PHOTO_PERMISSION_DENIED' : 'PHOTO_PERMISSION_BLOCKED'
    throw error
  }
  // 사진첩에 보이는 이름이 되도록 파일 이름을 붙인 복사본을 저장한다
  const directory = new Directory(Paths.cache, `dio-gif-export-${randomUUID()}`)
  let created = false
  try {
    directory.create(); created = true
    const temporary = new File(directory, fileName)
    await new File(result.uri).copy(temporary)
    await saveToLibraryAsync(temporary.uri)
    return { status: 'saved', fileName, destination: 'photos' }
  } finally {
    if (created) { try { directory.delete() } catch {} }
  }
}
