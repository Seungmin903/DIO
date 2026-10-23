import UPNG from 'upng-js'
import { Directory, File, Paths } from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
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
    file.write(bytes)
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
