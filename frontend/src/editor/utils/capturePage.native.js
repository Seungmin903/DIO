import { captureRef, releaseCapture } from 'react-native-view-shot'

export async function capturePage(node, snapshot) {
  const uri = await captureRef(node, { format: 'png', result: 'tmpfile', width: snapshot.pixelWidth, height: snapshot.pixelHeight })
  return { uri, width: snapshot.pixelWidth, height: snapshot.pixelHeight, dispose: () => releaseCapture(uri) }
}
