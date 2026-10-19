import { Image, StyleSheet, Text, View } from 'react-native'
import Svg, { ClipPath, Defs, Image as SvgImage, Path } from 'react-native-svg'
import { coverLayout, photoInnerBox } from '../utils/objects'
import { shapePath } from '../utils/shapes'
import { useSvgId } from '../utils/svgId'
import TapeView from './TapeView'

/**
 * 오브젝트 하나의 생김새. 위치·회전은 바깥에서 잡고, 여기서는 zoom 배율로 내용만 그린다.
 * 편집 화면, 페이지 썸네일, 레이어 미리보기에서 함께 쓴다.
 */
export default function ObjectContent({ object, zoom }) {
  const width = object.w * zoom
  const height = object.h * zoom
  switch (object.type) {
    case 'sticker':
      return <StickerContent object={object} width={width} height={height} />
    case 'tape':
      return (
        <TapeView
          pattern={object.pattern}
          src={object.src}
          edge={object.edge}
          width={width}
          height={height}
          scale={zoom}
        />
      )
    case 'photo':
      return <PhotoContent photo={object} zoom={zoom} />
    default:
      return null
  }
}

function StickerContent({ object, width, height }) {
  const flip = object.flipX ? [{ scaleX: -1 }] : undefined
  if (object.src) {
    return <Image source={{ uri: object.src }} style={{ width, height, transform: flip }} resizeMode="contain" />
  }
  const fontSize = height * 0.78
  // 흰 테두리는 텍스트 그림자를 겹쳐서 흉내 낸다. (RN 에는 drop-shadow 필터가 없음)
  return (
    <View style={[styles.center, { width, height, transform: flip }]}>
      <Text style={[styles.emoji, styles.emojiOutline, { fontSize, lineHeight: height, textShadowRadius: height * 0.08 }]}>
        {object.emoji}
      </Text>
      <Text style={[styles.emoji, styles.emojiFront, { fontSize, lineHeight: height }]}>{object.emoji}</Text>
    </View>
  )
}

export function PhotoContent({ photo, zoom }) {
  const clipId = useSvgId('photo-clip')
  const inner = photoInnerBox(photo)
  const box = { width: inner.width * zoom, height: inner.height * zoom }
  const layout = coverLayout(photo, box.width, box.height)
  const flip = photo.flipX ? [{ scaleX: -1 }] : undefined

  if (photo.frame === 'shape') {
    const d = shapePath(photo.shape, box.width, box.height)
    return (
      <Svg width={box.width} height={box.height} style={{ transform: flip }}>
        <Defs>
          <ClipPath id={clipId}>
            <Path d={d} />
          </ClipPath>
        </Defs>
        <SvgImage
          href={{ uri: photo.src }}
          x={layout.left}
          y={layout.top}
          width={layout.width}
          height={layout.height}
          preserveAspectRatio="none"
          clipPath={`url(#${clipId})`}
        />
        <Path d={d} fill="none" stroke="#FFFFFF" strokeWidth={Math.max(1.5, 4 * zoom)} />
      </Svg>
    )
  }

  return (
    <View style={[styles.polaroid, { width: photo.w * zoom, height: photo.h * zoom }]}>
      <View
        style={[
          styles.photoInner,
          { left: inner.left * zoom, top: inner.top * zoom, width: box.width, height: box.height, transform: flip },
        ]}
      >
        <Image source={{ uri: photo.src }} style={[styles.photoImage, layout]} resizeMode="stretch" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  emoji: { position: 'absolute', textAlign: 'center', includeFontPadding: false },
  emojiOutline: { color: '#FFFFFF', textShadowColor: '#FFFFFF', textShadowOffset: { width: 0, height: 0 } },
  emojiFront: { textShadowColor: 'rgba(11,25,87,0.22)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  polaroid: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0B1957',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  photoInner: { position: 'absolute', overflow: 'hidden', backgroundColor: '#E7EEF7' },
  photoImage: { position: 'absolute' },
})
