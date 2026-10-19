import { File, FileMode } from 'expo-file-system'
import { Image } from 'react-native'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { detectMediaType } from './mediaPolicy.js'
import { PageExportError } from './pageExport.js'

export async function exportImage({ blob }) {
  const handle = blob.open(FileMode.ReadOnly)
  let format
  try { format = detectMediaType(handle.readBytes(64)) } finally { handle.close() }
  if (format.extension === 'gif') throw new PageExportError('EXPORT_GIF_PENDING', 'GIF의 첫 프레임 내보내기는 준비 중이에요. GIF를 숨긴 뒤 다시 시도해 주세요.')
  if (format.extension !== 'heic') {
    await new Promise((resolve, reject) => Image.getSize(blob.uri, resolve, reject))
    return { uri: blob.uri, dispose() {} }
  }
  const context = ImageManipulator.manipulate(blob.uri)
  let rendered
  try {
    rendered = await context.renderAsync()
    const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 1 })
    return { uri: result.uri, dispose() { const file = new File(result.uri); if (file.exists) file.delete() } }
  } finally { rendered?.release?.(); context.release?.() }
}

export async function readLegacyExportImage(uri) { return { blob: new File(uri) } }
