import UPNG from 'upng-js'
import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { photoTone } from './photoTone'

const SIZE = 24
const readBytes = async file => typeof file.bytes === 'function' ? await file.bytes() : new Uint8Array(await file.arrayBuffer())

/** 사진 주소 → 대표 색 (#RRGGBB). 작게 줄인 PNG 를 풀어 픽셀을 읽는다. 못 읽으면 null */
export async function loadPhotoTone(uri) {
  const context = ImageManipulator.manipulate(uri)
  let rendered, small
  try {
    context.resize({ width: SIZE })
    rendered = await context.renderAsync()
    small = await rendered.saveAsync({ format: SaveFormat.PNG, compress: 1 })
    const image = UPNG.decode((await readBytes(new File(small.uri))).buffer)
    return photoTone(new Uint8Array(UPNG.toRGBA8(image)[0]))
  } catch { return null }
  finally {
    rendered?.release?.(); context.release?.()
    try { if (small) { const file = new File(small.uri); if (file.exists) file.delete() } } catch { /* 임시 파일 정리 실패는 무시 */ }
  }
}
