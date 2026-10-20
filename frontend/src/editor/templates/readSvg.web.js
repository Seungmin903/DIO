export async function readSvg(uri) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(uri, { signal: controller.signal })
    if (!response.ok) throw new Error('SVG HTTP ' + response.status)
    return await response.text()
  } finally { clearTimeout(timer) }
}
