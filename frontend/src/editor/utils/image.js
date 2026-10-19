import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'

/**
 * 사진 보관함에서 이미지를 골라 maxSize 이하로 줄인 data URI 로 돌려준다.
 * 백엔드 업로드가 붙기 전까지 문서에 그대로 저장하기 위해 크기를 줄인다.
 * 취소하면 빈 배열.
 */
export async function pickImages({ maxSize = 1080, multiple = true, keepAlpha = false } = {}) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) throw new Error('사진 보관함 접근을 허용해 주세요.')

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: multiple,
    quality: 1,
  })
  if (result.canceled) return []

  const images = []
  for (const asset of result.assets) {
    const scale = Math.min(1, maxSize / Math.max(asset.width, asset.height))
    const width = Math.max(1, Math.round(asset.width * scale))
    const height = Math.max(1, Math.round(asset.height * scale))
    const output = await manipulateAsync(asset.uri, scale < 1 ? [{ resize: { width, height } }] : [], {
      compress: 0.8,
      format: keepAlpha ? SaveFormat.PNG : SaveFormat.JPEG,
      base64: true,
    })
    images.push({
      src: `data:image/${keepAlpha ? 'png' : 'jpeg'};base64,${output.base64}`,
      width: output.width,
      height: output.height,
      name: asset.fileName?.replace(/\.[^.]+$/, '') ?? '사진',
    })
  }
  return images
}
