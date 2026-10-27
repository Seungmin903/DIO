import { File, FileMode, Paths } from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
import { Image } from 'react-native'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { detectMediaType } from './mediaPolicy.js'
import { PageExportError } from './pageExport.js'
import { parseImageDataUri } from './exportSampling.js'

export async function exportImage({ blob, media, size }) {
  const handle = blob.open(FileMode.ReadOnly)
  let format, png
  try {
    format = detectMediaType(await handle.readBytes(64))
    if (format.extension === 'gif') {
      // 50MiB GIF 를 통째로 읽지 않고 첫 장면이 끝나는 곳까지만 읽는다. 크기를 모르면 예전처럼 전부 읽는다.
      const { gifFirstFramePng, gifFirstFramePngFromHead } = await import('./gifFirstFrame.js')
      const total = handle.size ?? blob.size
      ;({ png } = Number.isFinite(total)
        ? await gifFirstFramePngFromHead((length) => { handle.offset = 0; return handle.readBytes(length) }, total, { size })
        : gifFirstFramePng(await blob.bytes(), { size }))
    }
  } finally { handle.close() }
  if (format.extension === 'gif') {
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
