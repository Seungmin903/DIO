import { photoTone } from './photoTone'

const SIZE = 24

/** 사진 주소 → 대표 색 (#RRGGBB). 캔버스에 작게 그려 픽셀을 읽는다. 못 읽으면 null */
export function loadPhotoTone(uri) {
  return new Promise(resolve => {
    const image = new window.Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      try {
        const height = Math.max(1, Math.round(SIZE * image.naturalHeight / Math.max(1, image.naturalWidth)))
        const canvas = document.createElement('canvas')
        canvas.width = SIZE; canvas.height = height
        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0, SIZE, height)
        resolve(photoTone(context.getImageData(0, 0, SIZE, height).data))
      } catch { resolve(null) }
    }
    image.onerror = () => resolve(null)
    image.src = uri
  })
}
