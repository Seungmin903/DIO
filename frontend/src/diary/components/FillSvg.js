import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';

/**
 * 부모를 채우는 SVG. 안드로이드에서는 width="100%" 인 SVG가 부모 크기가 바뀐 뒤 다시 그려지지 않을 때가 있어
 * (한눈에처럼 칸을 잰 뒤 표지 크기가 바뀌는 경우) 실제 크기를 재서 숫자로 넘기고, 크기가 바뀌면 SVG를 새로 만든다.
 * children 은 (width, height) 를 받는 함수다.
 */
export default function FillSvg({ children }) {
  const [size, setSize] = useState(null);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}
      onLayout={({ nativeEvent: { layout: { width, height } } }) => setSize(prev => (prev && prev.width === width && prev.height === height ? prev : { width, height }))}>
      {size && size.width > 0 && size.height > 0 ? (
        <Svg key={`${size.width}x${size.height}`} width={size.width} height={size.height}>
          {children(size.width, size.height)}
        </Svg>
      ) : null}
    </View>
  );
}
