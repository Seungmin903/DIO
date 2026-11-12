import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';

/**
 * 부모를 채우는 SVG. 안드로이드에서는 width="100%" 인 SVG가 부모 크기가 바뀐 뒤 다시 그려지지 않을 때가 있어
 * (한눈에처럼 칸을 잰 뒤 표지 크기가 바뀌는 경우) 실제 크기를 재서 숫자로 넘기고, 크기가 바뀌면 SVG를 새로 만든다.
 * children 은 (width, height) 를 받는 함수다.
 * initialWidth · initialHeight: 부모 크기를 미리 알면 넘긴다. 잰 값이 오기 전에도 그 크기로 첫 프레임부터 그려서, 빈 바탕 → 그림이 나뉘어 나타나지 않는다.
 */
// bleed: 사방으로 이만큼 넘치게 그린다(부모가 overflow hidden 으로 잘라 낸다). 작은 견본에서 그림이 칸보다 1dp 작아 끝에 바탕 띠가 남던 것을 막는다
export default function FillSvg({ children, initialWidth, initialHeight, bleed = 0 }) {
  const [size, setSize] = useState(initialWidth > 0 && initialHeight > 0 ? { width: initialWidth + bleed * 2, height: initialHeight + bleed * 2 } : null);
  return (
    <View pointerEvents="none" style={bleed ? { position: 'absolute', top: -bleed, left: -bleed, right: -bleed, bottom: -bleed } : StyleSheet.absoluteFill}
      onLayout={({ nativeEvent: { layout: { width, height } } }) => setSize(prev => (prev && prev.width === width && prev.height === height ? prev : { width, height }))}>
      {size && size.width > 0 && size.height > 0 ? (
        <Svg key={`${size.width}x${size.height}`} width={size.width} height={size.height}>
          {children(size.width, size.height)}
        </Svg>
      ) : null}
    </View>
  );
}
