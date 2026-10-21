export const PDF_SHARE_TTL = 24 * 60 * 60 * 1000
export const pdfSaveFailure = (code, message) => Object.assign(new Error(message), { code })

export function pdfSaveMessage(outcome) {
  if (outcome.status === 'saved') return `${outcome.fileName} 저장을 완료했어요.`
  if (outcome.status === 'cancelled') return '저장·공유를 취소했어요. 다시 시도할 수 있어요.'
  if (outcome.status === 'share-finished') return '공유 창을 닫았어요. 선택한 앱에서 결과를 확인해 주세요.'
  return '다운로드를 시작했어요. 브라우저 다운로드 목록에서 결과를 확인해 주세요.'
}
export function pdfSaveError(error) {
  if (error?.code === 'EXPORT_PDF_SHARE_UNAVAILABLE') return '이 기기에서는 파일 공유를 사용할 수 없어요. 웹에서 PDF 파일 저장을 이용해 주세요.'
  const value = `${error?.code || ''} ${error?.name || ''} ${error?.message || ''}`
  if (/ENOSPC|quota|no space|disk full|storage.*full/i.test(value)) return '저장 공간이 부족해요. 공간을 확보한 뒤 다시 저장해 주세요.'
  if (/NotAllowed|SecurityError|permission|access denied|EACCES|EPERM/i.test(value)) return '저장·공유에 접근하지 못했어요. 권한이나 저장 위치를 확인하고 다시 시도해 주세요.'
  return 'PDF를 저장·공유하지 못했어요. 같은 PDF로 다시 시도할 수 있어요.'
}

/** 원본 결과와 독립된 공유 복사본만 소유한다. OS API 반환을 저장 성공으로 해석하지 않는다. */
export function createPdfShareService({ list, remove, createCopy, setExpiry, isAvailable, share, now = Date.now }) {
  const active = new Set()
  const cleanup = async () => {
    let removed = 0
    try {
      for (const entry of await list()) {
        if (!active.has(entry.uri) && Number.isFinite(entry.expiresAt) && entry.expiresAt <= now()) {
          try { await remove(entry); removed++ } catch {}
        }
      }
    } catch {}
    return { removed }
  }
  return {
    cleanup,
    async save(result) {
      await cleanup()
      if (!await isAvailable()) throw pdfSaveFailure('EXPORT_PDF_SHARE_UNAVAILABLE', 'PDF sharing unavailable')
      const entry = await createCopy(result, now() + PDF_SHARE_TTL)
      active.add(entry.cacheKey ?? entry.uri)
      try {
        await share(entry.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'PDF 파일 저장·공유' })
        return { status: 'share-finished', fileName: result.fileName }
      } catch (error) {
        if (error.name === 'AbortError') return { status: 'cancelled' }
        throw error
      } finally {
        // 반환 직후 삭제하지 않는다. 실패했어도 OS가 파일을 읽었을 수 있다.
        try { await setExpiry(entry, now() + PDF_SHARE_TTL) } catch {}
        active.delete(entry.cacheKey ?? entry.uri)
      }
    },
  }
}
