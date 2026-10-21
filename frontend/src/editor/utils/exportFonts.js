import { textStyle } from './text.js'
import { PageExportError } from './pageExport.js'

/** 현재 편집기는 OS 기본 폰트 세 종류만 사용한다. 웹은 실제 문자열의 글리프 준비를 기다린다. */
export async function waitForExportFonts(objects, fonts) {
  if (!fonts) return // 네이티브는 별도 다운로드 없는 OS 기본 폰트다.
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
