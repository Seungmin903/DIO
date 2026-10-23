import { textStyle } from './text.js'
import { PageExportError } from './pageExport.js'

/** 공통 textStyle의 실제 face와 문자열로 웹 글리프 준비를 기다린다. */
export async function waitForExportFonts(objects, fonts) {
  if (!fonts) return // 네이티브 face는 앱의 preloadTextFonts에서 준비한다.
  try {
    const requests = objects.filter(o => o.type === 'text' && o.text).map(o => {
      const s = textStyle(o, 1, 'web')
      return fonts.load(`${s.fontStyle} ${s.fontWeight} ${s.fontSize}px ${s.fontFamily}`, o.text)
    })
    await Promise.all(requests)
    await fonts.ready
  } catch (error) {
    throw new PageExportError('EXPORT_FONT_FAILED', '글꼴을 준비하지 못했어요. 다시 시도해 주세요.', error)
  }
}
