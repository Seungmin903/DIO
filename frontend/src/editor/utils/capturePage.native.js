import { captureRef, releaseCapture } from 'react-native-view-shot'
import { PixelRatio, Platform } from 'react-native'
import { File, FileMode } from 'expo-file-system'
import { captureDimensions, verifyCaptureDimensions } from './capturePixels.js'

export async function capturePage(node, snapshot) {
  const size = captureDimensions(snapshot, Platform.OS, PixelRatio.get())
  const uri = await captureRef(node, { format: 'png', result: 'tmpfile', ...size })
  let released = false
  const dispose = () => { if (!released) { released = true; releaseCapture(uri) } }
  try {
    const reader = new File(uri).open(FileMode.ReadOnly)
    let dimensions
    try { dimensions = verifyCaptureDimensions(reader.readBytes(24), snapshot) }
    finally { reader.close() }
    return { uri, ...dimensions, dispose }
  } catch (error) {
    try { dispose() } catch {}
    throw error
  }
}
