import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageImageSurface from '../components/PageImageSurface'
import { createPageImageRenderer } from '../utils/pageImageRenderer.js'
import { preparePageExport } from '../utils/preparePageExport'

/** 호출 화면은 surface를 마운트하고 결과 사용이 끝나면 dispose한다. */
export function usePageImageRenderer() {
  const [job, setJob] = useState(null)
  const mounted = useRef(true), nextId = useRef(0)
  const render = useCallback((snapshot, { signal }) => new Promise((resolve, reject) => {
    const id = ++nextId.current
    let settled = false
    const request = { id, snapshot, signal, capturing: false }
    const finish = (error, result) => {
      if (settled) { result?.dispose(); return }
      settled = true
      signal.removeEventListener('abort', abort)
      if (mounted.current) setJob((current) => current?.id === id ? null : current)
      if (signal.aborted) { result?.dispose(); reject(signal.reason) }
      else if (error) reject(error)
      else resolve(result)
    }
    // 캡처가 시작됐다면 해당 IO가 끝날 때까지 준비 소재를 유지한다.
    const abort = () => { if (!request.capturing) finish(signal.reason) }
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    setJob({ ...request, resolve: (result) => finish(null, result), reject: (error) => finish(error), onCaptureStart: () => { request.capturing = true } })
  }), [])
  const renderer = useMemo(() => createPageImageRenderer({ prepare: preparePageExport, render }), [render])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; renderer.cancel() }
  }, [renderer])
  return { renderPageImage: renderer.renderPageImage, surface: job ? <PageImageSurface key={job.id} job={job} /> : null }
}
