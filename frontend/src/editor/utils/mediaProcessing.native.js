import { Image } from 'react-native'
import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { displayDimensions, MediaError } from './mediaPolicy.js'

async function manipulate(uri, size, format, compress = 0.92) {
  const context = ImageManipulator.manipulate(uri)
  let rendered
  try {
    if (size) context.resize(size)
    rendered = await context.renderAsync()
    return await rendered.saveAsync({ format, compress })
  } finally { rendered?.release?.(); context.release?.() }
}

export async function decode(input, format) {
  if (format.extension === 'heic') {
    try {
      const converted = await manipulate(input.source.uri, null, SaveFormat.JPEG, 1)
      input.decodedSource = new File(converted.uri)
      return { width: converted.width, height: converted.height }
    } catch (error) {
      throw new MediaError('HEIC_CONVERSION_FAILED', '이 기기에서 HEIC 사진을 변환하지 못했어요. JPEG로 저장한 사진을 선택해 주세요.', error)
    }
  }
  return new Promise((resolve, reject) => Image.getSize(input.source.uri,
    (width, height) => resolve({ width, height }), reject))
}

export async function createDisplay(input, format, dimensions, usage) {
  const size = displayDimensions(dimensions, usage)
  if (!input.decodedSource && size.width === dimensions.width && size.height === dimensions.height) return null
  const jpeg = ['jpg', 'heic'].includes(format.extension)
  const result = await manipulate((input.decodedSource ?? input.source).uri, size, jpeg ? SaveFormat.JPEG : SaveFormat.PNG)
  input.displaySource = new File(result.uri)
  return { source: input.displaySource, metadata: {
    width: result.width, height: result.height, mimeType: jpeg ? 'image/jpeg' : 'image/png',
    extension: jpeg ? 'jpg' : 'png', fileSize: input.displaySource.size,
  } }
}

export function dispose(input) {
  // 앱 보관소에 복사한 파일과 picker 원본은 건드리지 않고 가공 캐시만 제거한다.
  for (const file of [input.decodedSource, input.displaySource]) {
    try { if (file?.exists) file.delete() } catch { /* OS 캐시 정리에 맡긴다. */ }
  }
}
