import { MediaError } from './mediaPolicy.js'
import { splitError } from './stickerSplit.js'

const SAVE_MESSAGES = new Set([
  '폴더 이름과 저장할 스티커를 선택해 주세요.',
  '보관함을 읽은 뒤 다시 시도해 주세요.',
  '폴더 이름을 입력해 주세요.',
  '폴더가 없어졌어요. 새 폴더로 다시 저장해 주세요.',
  '같은 이름의 폴더가 있어요.',
  '같은 이름의 폴더나 분류가 있어요.',
  '꾸미기 보관함 변경사항을 저장하지 못했어요. 저장 공간을 확인하고 다시 시도해 주세요.',
])
export function splitSaveError(error) {
  if (SAVE_MESSAGES.has(error?.message)) return error.message
  if (error instanceof MediaError && /[가-힣]/.test(error.message)) return error.message
  if (/PNG_WRITE_FAILED/.test(String(error?.message))) return '스티커 이미지를 저장하지 못했어요. 저장 공간을 확인하고 다시 시도해 주세요.'
  if (/INVALID_CANDIDATE/.test(String(error?.message))) return '분리된 스티커를 읽지 못했어요. 다시 분리한 뒤 저장해 주세요.'
  return splitError(error)
}

/** Publish only fully imported results; a failed publish rolls back those new files. */
export async function saveSplitSelection({ parts, name, folderId, importFiles, publish, discard }) {
  const cleanName = name.trim()
  if (!cleanName || !parts.length) throw new Error('폴더 이름과 저장할 스티커를 선택해 주세요.')
  let imported = []
  try {
    imported = await importFiles(parts.map((part, i) => ({ uri: part.uri, width: part.width, height: part.height, fileName: `${cleanName}-${i + 1}.png` })), { usage: 'sticker' })
    return await publish(folderId, cleanName, imported.map((part, i) => ({ ...part, name: `${cleanName} ${i + 1}`, aspect: part.width / part.height })))
  } catch (error) {
    if (imported.length) await discard(imported)
    throw error
  }
}
