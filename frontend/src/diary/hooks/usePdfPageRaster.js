import { useEffect, useState } from 'react'
import { localPdfRasterKey, resolveLocalPdfRaster } from '../utils/pdfPageRaster'

export function usePdfPageRaster(source) {
  const key = localPdfRasterKey(source)
  const [result, setResult] = useState(null)
  useEffect(() => {
    if (!key) return undefined
    let active = true
    resolveLocalPdfRaster(source).then(uri => { if (active) setResult({ key, uri }) })
    return () => { active = false }
  }, [key, source])
  const current = key && result?.key === key ? result : null
  return { uri: current?.uri ?? null, pending: Boolean(key && !current) }
}
