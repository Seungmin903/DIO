import { useSyncExternalStore } from 'react'
import { stickerPacksSnapshot, subscribeStickerPacks } from '../builtinStickers'

/** 원격 스티커 팩이 들어오면 다시 그린다(보관함 · 이미 붙인 원격 스티커). 바뀐 횟수를 돌려준다 */
export const useStickerPacks = () => useSyncExternalStore(subscribeStickerPacks, stickerPacksSnapshot, stickerPacksSnapshot)
