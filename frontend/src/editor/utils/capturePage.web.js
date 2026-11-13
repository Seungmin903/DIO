import { waitForExportFonts } from './exportFonts.js'
import { toBlob } from 'html-to-image'
import { PageExportError } from './pageExport.js'
import { personalFontExportCSS } from '../../handwriting/library.js'

export async function capturePage(node, snapshot) {
  await waitForExportFonts(snapshot.objects, document.fonts)
  const fontEmbedCSS = await personalFontExportCSS(snapshot.objects)
  const blob = await toBlob(node, {
    width: snapshot.width, height: snapshot.height, canvasWidth: snapshot.pixelWidth, canvasHeight: snapshot.pixelHeight,
    // GIF 층 합성의 사이 · 맨 위 층은 투명 바탕으로 찍는다(PageImageSurface 의 layer)
    pixelRatio: 1, skipAutoScale: true, backgroundColor: snapshot.layer === 'middle' || snapshot.layer === 'top' ? undefined : snapshot.background, skipFonts: true, fontEmbedCSS,
  })
  if (!blob) throw new PageExportError('EXPORT_CAPTURE_FAILED', 'PNG를 만들지 못했어요. 다시 시도해 주세요.')
  const uri = URL.createObjectURL(blob)
  return { uri, blob, width: snapshot.pixelWidth, height: snapshot.pixelHeight, dispose: () => URL.revokeObjectURL(uri) }
}
