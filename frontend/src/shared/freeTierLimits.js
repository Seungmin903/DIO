export const PERSONAL_DIARY_LIMIT = 5
export const DIARY_PAGE_LIMIT = 150
export const SHARED_DIARY_LIMIT = 2
export const STICKER_LIMIT = 200
export const PHOTO_LIMIT = 200
export const TAPE_LIMIT = 5

export function checkStorageLimit(kind, count, currentCount) {
  const limits = {
    sticker: [STICKER_LIMIT, '스티커', '개'],
    photo: [PHOTO_LIMIT, '사진', '장'],
    tape: [TAPE_LIMIT, '마스킹 테이프', '개'],
  }
  const [limit, label, unit] = limits[kind]
  if (count > limit) {
    const remaining = kind === 'sticker' && currentCount < limit
      ? ` 보관함 전체에 ${currentCount}개가 있고, ${limit - currentCount}개 더 저장할 수 있어요.`
      : ''
    const ending = unit === '장' ? '이에요' : '예요'
    throw Object.assign(new Error(`${label} 저장 한도는 ${limit}${unit}${ending}.${remaining}`), { code: 'STORAGE_LIMIT_REACHED' })
  }
}

export const PERSONAL_DIARY_LIMIT_MESSAGE = `개인 다이어리는 최대 ${PERSONAL_DIARY_LIMIT}개까지 만들 수 있어요.`
export const DIARY_PAGE_LIMIT_MESSAGE = `다이어리 한 권에는 최대 ${DIARY_PAGE_LIMIT}쪽까지 넣을 수 있어요.`
