import { Image } from 'react-native'
import { selectImages } from '../utils/mediaPicker'

export async function pickCutoutPhoto() {
  const result = await selectImages({ multiple: false })
  if (result.canceled || !result.assets?.length) return null
  const asset = result.assets[0]
  const mime = (asset.file?.type || asset.mimeType || '').split(';')[0].trim().toLowerCase()
  const name = asset.file?.name || asset.fileName || ''
  const extension = name.match(/\.([^.]+)$/)?.[1]?.toLowerCase()
  const knownMime = mime && mime !== 'application/octet-stream'
  const allowedExtension = ['jpg', 'jpeg', 'png', 'webp'].includes(extension)
  if (knownMime
    ? !['image/jpeg', 'image/png', 'image/webp'].includes(mime) || Boolean(extension && !allowedExtension)
    : !allowedExtension)
    throw new Error('이번 미리보기는 JPG·PNG·WebP 사진을 선택해 주세요.')
  if ((asset.file?.size || asset.fileSize || 0) > 20 * 1024 * 1024)
    throw new Error('20MB 이하 사진을 선택해 주세요.')
  const ownedUrl = asset.file ? URL.createObjectURL(asset.file) : null
  const uri = ownedUrl || asset.uri
  const dispose = () => { if (ownedUrl) URL.revokeObjectURL(ownedUrl) }
  try {
    if (!uri) throw new Error('사진을 읽지 못했어요. 다시 선택해 주세요.')
    const { width, height } = await new Promise((resolve, reject) => Image.getSize(uri,
      (width, height) => resolve({ width, height }), reject))
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height > 40_000_000)
      throw new Error('사진 크기를 확인해 주세요. 최대 4천만 화소까지 지원해요.')
    return { uri, width, height, dispose }
  } catch (error) { dispose(); throw error }
}
