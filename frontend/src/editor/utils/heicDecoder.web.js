// LGPL decoder is a separate, replaceable same-origin module, not Metro code.
let pending
export function loadHeicDecoder() {
  if (pending) return pending
  pending = new Promise((resolve, reject) => {
    const configured = globalThis.DIO_HEIC_DECODER_URL ?? 'vendor/heic-to/1.6.6/register.mjs'
    const url = new URL(configured, document.baseURI)
    if (url.origin !== location.origin) { reject(new Error('HEIC decoder must use this site’s origin.')); return }
    const script = document.createElement('script')
    script.type = 'module'; script.src = url.href
    script.onload = () => {
      const decoder = globalThis.DIOHeic
      if (typeof decoder?.heicTo !== 'function') { reject(new Error('HEIC decoder interface is unavailable.')); return }
      resolve(decoder)
    }
    script.onerror = () => { script.remove(); reject(new Error('HEIC decoder could not be loaded.')) }
    document.head.appendChild(script)
  }).catch(error => { pending = undefined; throw error })
  return pending
}
