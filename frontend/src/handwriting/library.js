import { loadAsync } from 'expo-font'
import { getTextFonts, loadedFontFamily, markTextFontFailed, markTextFontLoaded, registerPersonalTextFonts } from '../editor/utils/text.js'
import { loadFontLibrary } from './storage.js'
import { readFontBytes } from './files'
import { toBase64 } from './fontFormat.js'
import { sharedFontUri } from './sharedFonts.js'

let loading
export function refreshPersonalFonts() {
  loading = (async () => {
    const fonts = await loadFontLibrary()
    registerPersonalTextFonts(fonts)
    await Promise.all(fonts.map(async font => {
      try {
        if (font.missing) throw new Error('폰트 파일 없음')
        if (!loadedFontFamily(font.id)) await loadAsync({ [font.family]: { uri: font.uri } })
        markTextFontLoaded(font.family)
      } catch { markTextFontFailed(font.family) }
    }))
    return fonts
  })()
  return loading
}
export async function ensurePersonalFonts(objects) {
  const wanted = objects.filter(o => ['text','shape'].includes(o.type) && o.font?.startsWith('personal-')).map(o => o.font)
  if (!wanted.length) return
  if (!loading) refreshPersonalFonts()
  await loading
  if (wanted.some(id => !getTextFonts().some(f => f.id === id) || !loadedFontFamily(id))) throw new Error('내 폰트를 불러오지 못했어요. 폰트 파일을 다시 가져온 뒤 내보내 주세요.')
}

// SVG foreignObject capture has its own font context. An app-loaded FontFace
// alone does not make its glyphs available inside the exported image.
export async function personalFontExportCSS(objects) {
  const ids = [...new Set(objects.filter(o => ['text','shape'].includes(o.type) && o.font?.startsWith('personal-')).map(o => o.font))]
  if (!ids.length) return undefined
  await ensurePersonalFonts(objects)
  const fonts = await loading
  return (await Promise.all(ids.map(async id => {
    // 내 폰트가 없으면 공유 다이어리에서 받은 친구 폰트를 쓴다
    const mine = fonts.find(f => f.id === id && !f.missing)
    const fileId = id.slice('personal-'.length)
    const font = mine ?? (sharedFontUri(fileId) ? { family: `DIOHW_${fileId.replaceAll('-', '')}`, uri: sharedFontUri(fileId) } : null)
    if (!font) throw new Error('내보낼 폰트 파일을 찾지 못했어요.')
    return `@font-face{font-family:'${font.family}';src:url(data:font/ttf;base64,${toBase64(await readFontBytes(font.uri))}) format('truetype');font-weight:400;font-style:normal;}`
  }))).join('\n')
}
