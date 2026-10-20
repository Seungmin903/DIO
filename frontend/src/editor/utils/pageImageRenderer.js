import { PageExportError } from './pageExport.js'

const abortError = () => new PageExportError('EXPORT_CANCELLED', '이미지 생성을 취소했어요.')

/** UI와 저장 형식을 모르는 단일 페이지 작업기. 결과 소유권은 호출자에게 전달한다. */
export function createPageImageRenderer({ prepare, render, timeoutMs = 30000, releaseGraceMs = 5000 }) {
  let active = null
  return {
    async renderPageImage(snapshot, { signal } = {}) {
      if (signal?.aborted) throw abortError()
      if (active) throw new PageExportError('EXPORT_BUSY', '다른 페이지를 만들고 있어요.')
      const controller = new AbortController()
      active = controller
      let timer, onAbort, graceTimer
      const release = () => { if (active === controller) active = null }
      const stopped = new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          // 멈춘 준비/캡처가 끝내 완료되지 않아도 유예 뒤에는 다음 작업을 받는다. 늦은 결과는 work가 정리한다.
          graceTimer = setTimeout(release, releaseGraceMs)
          reject(controller.signal.reason)
        }, { once: true })
      })
      onAbort = () => controller.abort(abortError())
      signal?.addEventListener('abort', onAbort, { once: true })
      timer = setTimeout(() => controller.abort(new PageExportError('EXPORT_TIMEOUT', '이미지 준비가 오래 걸리고 있어요. 다시 시도해 주세요.')), timeoutMs)
      const work = (async () => {
        let prepared
        try {
          prepared = await prepare(snapshot)
          if (controller.signal.aborted) throw controller.signal.reason
          const output = await render(prepared, { signal: controller.signal })
          if (controller.signal.aborted) { output.dispose(); throw controller.signal.reason }
          let disposed = false
          return { ...output, dispose() { if (!disposed) { disposed = true; output.dispose() } } }
        } finally { prepared?.dispose() }
      })()
      // 취소 즉시 호출자는 복귀하되, 취소 불가능한 준비/캡처의 늦은 결과는 work가 정리한다.
      try { return await Promise.race([work, stopped]) }
      finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        // 실제 IO가 끝나기 전에는 다음 페이지를 동시에 실행하지 않는다. 취소·시간 초과 뒤에는 유예 시간까지만 기다린다.
        work.finally(() => { clearTimeout(graceTimer); release() }).catch(() => {})
      }
    },
    cancel() { active?.abort(abortError()) },
  }
}
