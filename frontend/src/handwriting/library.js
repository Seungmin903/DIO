import { loadAsync } from 'expo-font'
import { loadedFontFamily, markTextFontFailed, markTextFontLoaded, registerPersonalTextFonts } from '../editor/utils/text.js'
import { loadFontLibrary } from './storage.js'
import { readFontBytes } from './files'
import { toBase64 } from './fontFormat.js'

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
const personalFontIds = objects => [...new Set(objects.filter(o => ['text','shape'].includes(o.type) && o.font?.startsWith('personal-')).map(o => o.font))]

/** 내보내기 전에 내 폰트 불러오기를 기다린다. 이 기기에서 쓸 수 없는 내 폰트는 화면과 같이 기본 고딕으로 내보낸다. */
export async function ensurePersonalFonts(objects) {
  if (!personalFontIds(objects).length) return
  if (!loading) refreshPersonalFonts()
  await loading.catch(() => {})
}

// SVG foreignObject capture has its own font context. An app-loaded FontFace
// alone does not make its glyphs available inside the exported image.
export async function personalFontExportCSS(objects) {
  const ids = personalFontIds(objects)
  if (!ids.length) return undefined
  await ensurePersonalFonts(objects)
  const fonts = await loading.catch(() => [])
  // 불러온 내 폰트만 넣는다. 나머지 글자는 textStyle이 고른 기본 고딕으로 그려진다.
  const usable = ids.map(id => fonts.find(f => f.id === id)).filter(font => font && !font.missing && loadedFontFamily(font.id))
  if (!usable.length) return undefined
  return (await Promise.all(usable.map(async font =>
    `@font-face{font-family:'${font.family}';src:url(data:font/ttf;base64,${toBase64(await readFontBytes(font.uri))}) format('truetype');font-weight:400;font-style:normal;}`
  ))).join('\n')
}
