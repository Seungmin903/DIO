import { useState } from 'react'
import { Image, Platform, View } from 'react-native'
import StaticPage from './StaticPage'

// Animation and final canvas share the same decoded local image. An image load
// error falls back to the complete page, including its paper/template.
// Canvas hides its own background while an image exists, even if loading fails.
// Exports never use this display cache.
export default function ReadingPageContent({ image, page, zoom, background, still = false }) {
  const [failed, setFailed] = useState(null)
  if (!image || failed === image.uri) return <StaticPage page={page} zoom={zoom} background={background} showBackground={true} still={still} cacheStrokes={Platform.OS !== 'web'} />
  const width = (page.canvasWidth ?? 1188) * zoom, height = (page.canvasHeight ?? 840) * zoom
  return <View pointerEvents="none" style={{ width, height, backgroundColor: background }}>
    <Image testID="reading-page-image" source={{ uri: image.uri }} resizeMode="stretch" fadeDuration={0} onError={() => setFailed(image.uri)} style={{ width, height }} />
  </View>
}
