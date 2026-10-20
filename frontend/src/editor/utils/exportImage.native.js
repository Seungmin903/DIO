import { File, FileMode, Paths } from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
import { Image } from 'react-native'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { detectMediaType } from './mediaPolicy.js'
import { PageExportError } from './pageExport.js'
import { parseImageDataUri } from './exportSampling.js'

export async function exportImage({ blob, media, size }) {
  const handle = blob.open(FileMode.ReadOnly)
  let format
  try { format = detectMediaType(handle.readBytes(64)) } finally { handle.close() }
  if (format.extension === 'gif') {
    const { gifFirstFramePng } = await import('./gifFirstFrame.js')
    const { png } = gifFirstFramePng(await blob.bytes(), { size })
    const file = new File(Paths.cache, `dio-gif-${randomUUID()}.png`)
    const dispose = () => { if (file.exists) file.delete() }
    try {
      file.create()
      file.write(png)
      return { uri: file.uri, dispose }
    } catch (error) { dispose(); throw error }
  }
  const resize = size && (!media?.width || media.width > size.width || media.height > size.height)
  if (format.extension !== 'heic' && !resize) {
    await new Promise((resolve, reject) => Image.getSize(blob.uri, resolve, reject))
    return { uri: blob.uri, dispose() {} }
  }
  const context = ImageManipulator.manipulate(blob.uri)
  let rendered
  try {
    if (resize) context.resize(size)
    rendered = await context.renderAsync()
    const jpeg = ['jpg', 'heic'].includes(format.extension)
    const result = await rendered.saveAsync({ format: jpeg ? SaveFormat.JPEG : SaveFormat.PNG, compress: 1 })
    return { uri: result.uri, dispose() { const file = new File(result.uri); if (file.exists) file.delete() } }
  } finally { rendered?.release?.(); context.release?.() }
}

export async function readLegacyExportImage(uri) {
  if (!uri.startsWith('data:')) return { blob: new File(uri) }
  const data = parseImageDataUri(uri)
  const file = new File(Paths.cache, `dio-export-${randomUUID()}.${data.extension}`)
  const dispose = () => { if (file.exists) file.delete() }
  try {
    file.create()
    file.write(data.base64, { encoding: 'base64' })
    return { blob: file, dispose }
  } catch (error) { dispose(); throw error }
}
