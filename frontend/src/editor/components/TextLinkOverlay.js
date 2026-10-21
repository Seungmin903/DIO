import { Linking, Platform, Text, View } from 'react-native'
import { textStyle } from '../utils/text'
import { normalizeTextLink, richTextSegments, segmentTextStyle } from '../utils/textFormats'

// 읽기 모드에서만 실제 글자 배치와 같은 투명 링크 면을 겹쳐 편집 조작과 충돌하지 않게 한다.
export default function TextLinkOverlay({ objects, zoom, onError }) {
  return objects.filter((o) => o.type === 'text' && !o.hidden && o.styleRanges?.some(r => r.href)).map((object) => {
    const scale = object.w / (object.baseWidth ?? object.w) * zoom
    return <View key={object.id} pointerEvents="box-none" style={{ position: 'absolute', left: object.x * zoom, top: object.y * zoom, width: object.w * zoom, height: object.h * zoom, transform: [{ rotate: `${object.rotation ?? 0}deg` }] }}>
      <Text style={{ ...textStyle(object, scale, Platform.OS), width: object.w * zoom, height: object.h * zoom, color: 'transparent' }}>
        {richTextSegments(object.text, object.colorRanges, object.styleRanges).map((segment, i) => <Text key={i} accessibilityRole={segment.href ? 'link' : undefined}
          onPress={segment.href ? () => Linking.openURL(normalizeTextLink(segment.href)).catch(() => onError?.('링크를 열지 못했어요.')) : undefined}
          style={{ ...segmentTextStyle(segment, scale), color: 'transparent' }}>{segment.text}</Text>)}
      </Text>
    </View>
  })
}
