import { mediaId } from './mediaReferences.js'

export const CUSTOM_STICKER_LIMIT = 200
export const stickerLimitMessage = excess => `지금은 스티커를 최대 200개까지 만들 수 있어요\n${excess}개 초과했어요.`

export function ownedStickerKeys(items) {
  const stickers = [...items.stickers, ...items.folders.flatMap(folder => folder.items)]
  return new Set(stickers.flatMap(sticker => {
    if (sticker.builtin || sticker.asset || sticker.widget) return []
    const key = mediaId(sticker) ?? sticker.src
    return key ? [key] : []
  }))
}

export function stickerLimitError(excess) {
  return Object.assign(new Error(stickerLimitMessage(excess)), { code: 'CUSTOM_STICKER_LIMIT' })
}
