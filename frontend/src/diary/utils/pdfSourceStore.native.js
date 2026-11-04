import { Directory, File, Paths } from 'expo-file-system'

// 불러온 PDF 원본을 앱 문서 폴더에 둔다. 확대하면 여기서 보이는 영역만 다시 그린다(pdfRegion).
const directory = () => new Directory(Paths.document, 'dio-pdf-source')
const fileOf = id => new File(directory(), `${id}.pdf`)

/** 고른 PDF(캐시 파일)를 보관한다. id 는 pdfSource.sourceId. */
export async function savePdfSource(id, sourceUri) {
  directory().create({ intermediates: true, idempotent: true })
  const target = fileOf(id)
  try {
    await new File(sourceUri).copy(target)
    if (!target.exists) throw new Error('Incomplete PDF copy')
    return target.uri
  } catch (error) {
    try { if (target.exists) target.delete() } catch { /* 미참조 파일만 남는다. */ }
    throw error
  }
}

/** 서버에서 내려받은 PDF 바이트를 보관한다(공유 다이어리의 친구 쪽). */
export async function savePdfSourceBytes(id, bytes) {
  directory().create({ intermediates: true, idempotent: true })
  const target = fileOf(id)
  try {
    target.create({ overwrite: true })
    await target.write(bytes)
    if (!target.exists) throw new Error('Incomplete PDF write')
    return target.uri
  } catch (error) {
    try { if (target.exists) target.delete() } catch { /* 미참조 파일만 남는다. */ }
    throw error
  }
}

/** 보관한 PDF 의 바이트 수. 없으면 null. */
export function pdfSourceSize(id) {
  try { const file = fileOf(id); return file.exists ? file.size : null } catch { return null }
}

/** 보관한 PDF 의 파일 주소. 없으면 null. */
export function pdfSourceUri(id) {
  try { const file = fileOf(id); return file.exists ? file.uri : null } catch { return null }
}

export async function removePdfSource(id) {
  if (!id) return
  try { const file = fileOf(id); if (file.exists) file.delete() } catch { /* OS 정리에 맡긴다. */ }
}
