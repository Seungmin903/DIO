import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from './theme';

// 기본 프로필(사진이 없을 때): primaryStrong 동그라미에 디오의 흰 표정(눈 둘 · 웃는 입).
// 예전 avatar-default.png(512px 래스터)는 확대하면 눈 · 입 가장자리가 계단처럼 거칠어, 같은 위치 · 비율로 벡터로 다시 그렸다.
// style 에 width · height 를 주면 그 크기의 원이 된다(둥글게 자르는 것은 이 컴포넌트가 한다).
export default function DefaultAvatar({ style, accessibilityLabel, accessible = Boolean(accessibilityLabel) }) {
  return (
    <View accessible={accessible} accessibilityLabel={accessibilityLabel} accessibilityRole={accessible ? 'image' : undefined} style={[{ overflow: 'hidden', borderRadius: 9999, backgroundColor: colors.primaryStrong }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 512 512">
        <Circle cx="256" cy="256" r="256" fill={colors.primaryStrong} />
        <Circle cx="131" cy="234" r="30" fill="#FFFFFF" />
        <Circle cx="380" cy="235" r="30" fill="#FFFFFF" />
        <Path d="M224 287 Q255 335 287 287" fill="none" stroke="#FFFFFF" strokeWidth="24" strokeLinecap="round" />
      </Svg>
    </View>
  );
}
