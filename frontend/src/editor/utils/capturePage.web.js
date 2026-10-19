import { toBlob } from 'html-to-image'
import { PageExportError } from './pageExport.js'

export async function capturePage(node, snapshot) {
  const blob = await toBlob(node, {
    width: snapshot.width, height: snapshot.height, canvasWidth: snapshot.pixelWidth, canvasHeight: snapshot.pixelHeight,
    pixelRatio: 1, skipAutoScale: true, backgroundColor: snapshot.background, skipFonts: true,
  })
  if (!blob) throw new PageExportError('EXPORT_CAPTURE_FAILED', 'PNG를 만들지 못했어요. 다시 시도해 주세요.')
  const uri = URL.createObjectURL(blob)
  return { uri, blob, width: snapshot.pixelWidth, height: snapshot.pixelHeight, dispose: () => URL.revokeObjectURL(uri) }
}
