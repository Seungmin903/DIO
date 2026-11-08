// 표지 사진 자르기: 편집기 사진 자르기 창(PhotoCropper)에 넘길 사진 모양. 표지 비율(세로 3:4 · 가로 4:3)로 고정해 자른다.
// photo: 고른 사진({ src, mediaFileId, width, height } 또는 표지에 담긴 { src, mediaFileId, aspect, crop })
export const COVER_PHOTO_RATIO = { portrait: 3 / 4, landscape: 4 / 3 }

// 가져온 이미지에는 픽셀 크기가 있고 표지에는 가로/세로 비율이 필요하다.
export function coverPhotoWithAspect(photo) {
  const { width, height } = photo ?? {}
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw new Error('사진 크기를 확인하지 못했어요.')
  return { ...photo, aspect: width / height }
}

export function coverCropPhoto(photo, ratio) {
  const imageWidth = photo.width ?? (photo.aspect ? photo.aspect * 1000 : 1000)
  const imageHeight = photo.height ?? 1000
  return { id: 'cover-photo', type: 'photo', frame: 'none', src: photo.src, mediaFileId: photo.mediaFileId, imageWidth, imageHeight, x: 0, y: 0, w: ratio * 600, h: 600, crop: photo.crop ?? { fx: 0.5, fy: 0.5, zoom: 1 } }
}
