import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { makePoster, mediaSupported, putMedia } from './mediaStore'

/**
 * 사진 보관함에서 이미지를 골라 maxSize 이하로 줄인 data URI 로 돌려준다. (GIF 는 움직이도록 원본 그대로)
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
    if (isGif(asset)) {
      // GIF 는 줄이거나 다시 인코딩하면 첫 장면만 남으므로 원본 그대로 쓴다. (용량 제한 없음)
      // 웹은 원본을 보관소(IndexedDB)에 두고 문서에는 참조만, 썸네일용 첫 장면은 따로 만든다.
      const name = asset.fileName?.replace(/\.[^.]+$/, '') ?? 'GIF'
      if (mediaSupported) {
        const blob = await (await fetch(asset.uri)).blob()
        const [src, poster] = await Promise.all([putMedia(blob), makePoster(blob)])
        images.push({ src, poster, width: asset.width, height: asset.height, name })
      } else {
        images.push({ src: await readAsDataUri(asset.uri), width: asset.width, height: asset.height, name })
      }
      continue
    }
    // 투명 배경이 있을 수 있는 PNG·WebP 는 PNG 로 유지한다. (JPEG 로 바꾸면 투명한 곳이 검게 채워진다)
    const alpha = keepAlpha || hasAlphaFormat(asset)
    const scale = Math.min(1, maxSize / Math.max(asset.width, asset.height))
    const width = Math.max(1, Math.round(asset.width * scale))
    const height = Math.max(1, Math.round(asset.height * scale))
    const output = await manipulateAsync(asset.uri, scale < 1 ? [{ resize: { width, height } }] : [], {
      compress: 0.8,
      format: alpha ? SaveFormat.PNG : SaveFormat.JPEG,
      base64: true,
    })
    images.push({
      src: `data:image/${alpha ? 'png' : 'jpeg'};base64,${output.base64}`,
      width: output.width,
      height: output.height,
      name: asset.fileName?.replace(/\.[^.]+$/, '') ?? '사진',
    })
  }
  return images
}

function hasAlphaFormat(asset) {
  return (
    /^image\/(png|webp)$/.test(asset.mimeType ?? '') ||
    /\.(png|webp)$/i.test(asset.fileName ?? '') ||
    /^data:image\/(png|webp)/.test(asset.uri)
  )
}

function isGif(asset) {
  return asset.mimeType === 'image/gif' || /\.gif$/i.test(asset.fileName ?? '') || asset.uri.startsWith('data:image/gif')
}

async function readAsDataUri(uri) {
  if (uri.startsWith('data:')) return uri
  const blob = await (await fetch(uri)).blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('GIF를 불러오지 못했어요.'))
    reader.readAsDataURL(blob)
  })
}
