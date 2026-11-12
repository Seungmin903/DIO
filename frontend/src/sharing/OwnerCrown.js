import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { STAR_GOLD } from '../shared/FavoriteStar';
import { colors } from '../shared/theme';

// 소유자 표시: 프로필 동그라미 오른쪽 아래의 작은 왕관(지라 686, 2026-11-08).
// 모양은 앱 아이콘 세트와 같은 Lucide 'crown'(ISC) 윤곽을 채워 쓰고, 색은 즐겨찾기 별과 같은 금색(STAR_GOLD).
// 받침 동그라미 없이 왕관 둘레에 흰 윤곽을 둘러(즐겨찾기 별의 윤곽처럼) 사진 · 기본 프로필 어느 색 위에서도 보이게 한다.
// 장식이라 스크린리더는 읽지 않는다(역할 글자 '소유자'가 말한다).
const CROWN = 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z';
const BASE = 'M5 21h14';

export default function OwnerCrown({ size = 15 }) {
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', right: -4, bottom: -3, width: size, height: size }}>
      <Svg width={size} height={size} viewBox="-2 -2 28 28">
        {/* 바깥 흰 윤곽(굵게 먼저 그리고) → 금색 왕관을 위에 */}
        <Path d={CROWN} fill={colors.surface} stroke={colors.surface} strokeWidth={6} strokeLinejoin="round" />
        <Path d={BASE} fill="none" stroke={colors.surface} strokeWidth={7} strokeLinecap="round" />
        <Path d={CROWN} fill={STAR_GOLD} stroke={STAR_GOLD} strokeWidth={1.5} strokeLinejoin="round" />
        <Path d={BASE} fill="none" stroke={STAR_GOLD} strokeWidth={2.5} strokeLinecap="round" />
      </Svg>
    </View>
  );
}
