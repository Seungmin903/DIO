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
