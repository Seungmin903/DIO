import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { C } from '../constants';
import { colors } from '../../shared/theme';
import { PHONE_RAIL_WIDTH } from './SideRail';

// 폰 상단 안전 영역(전면 카메라 자리). 좌측 바의 바탕 · 오른쪽 선과 본문 바탕이 맨 위까지 이어진다.
// 메뉴를 펼치면 메뉴와 같은 속도로 메뉴 바탕이 넓어지고 본문 쪽은 메뉴 아래 막처럼 어두워진다(SideRail 의 railScrimTint 와 같은 값).
const RAIL_MS = 240;

export default function PhoneTopBand({ height, collapsed, bodyColor }) {
  const progress = useRef(new Animated.Value(collapsed ? 0 : 1)).current;
  useEffect(() => {
    const run = Animated.timing(progress, { toValue: collapsed ? 0 : 1, duration: RAIL_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [collapsed, progress]);
  const railWidth = progress.interpolate({ inputRange: [0, 1], outputRange: [PHONE_RAIL_WIDTH.collapsed, PHONE_RAIL_WIDTH.expanded] });
  return (
    <View style={{ height, flexDirection: 'row' }}>
      <Animated.View style={{ width: railWidth, backgroundColor: C.canvas, borderRightWidth: 1, borderRightColor: C.line, zIndex: 2 }} />
      <View style={{ flex: 1, backgroundColor: bodyColor }}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: progress }]} />
      </View>
    </View>
  );
}
