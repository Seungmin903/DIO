import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from './theme';

// 기본 프로필(사진이 없을 때): 색 동그라미에 모아의 표정(눈 둘 · 웃는 입).
// 디스코드 기본 프로필처럼 사람마다 배경색이 다르다. 색은 계정 id(seed)로 고르므로 같은 사람은 어디서나 같은 색이다.
// seed 가 없으면(가입 전 등) 첫 색(primaryStrong)이다.
// 예전 avatar-default.png(512px 래스터)는 확대하면 눈 · 입 가장자리가 계단처럼 거칠어, 같은 위치 · 비율로 벡터로 다시 그렸다.
// style 에 width · height 를 주면 그 크기의 원이 된다(둥글게 자르는 것은 이 컴포넌트가 한다).

// 배경 · 표정 · 테두리(연한 배경이 흰 카드에 묻히지 않게 1px). 코덱스가 색 규칙(UI 색상 계열) 안에서 고른 6색, 표정 대비는 모두 4.5:1 이상.
// 첫 색은 seed 가 없을 때 쓰는 예전 기본색(primaryStrong)이다.
export const AVATAR_TONES = [
  { fill: colors.primaryStrong, face: '#FFFFFF', ring: null },
  { fill: colors.text, face: '#FFFFFF', ring: null },
  { fill: colors.primaryText, face: '#FFFFFF', ring: null },
  { fill: colors.primary, face: colors.text, ring: null },
  { fill: colors.secondary, face: colors.text, ring: colors.primaryStrong },
  { fill: colors.lavender100, face: colors.text, ring: colors.primary },
];

/** 기본 프로필 색을 고를 id. 회원은 userId(공유 참여자 id 와 같다), 미리보기 계정은 accountId, 게스트는 기기에 남긴 avatarSeed */
export const avatarSeed = user => String(user?.userId ?? user?.accountId ?? user?.avatarSeed ?? user?.id ?? '');

export function avatarTone(seed) {
  const text = seed == null ? '' : String(seed);
  if (!text) return AVATAR_TONES[0];
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

// user: 계정({ userId } · { accountId } · 공유 참여자 { id }). seed 를 직접 줄 수도 있다.
export default function DefaultAvatar({ user, seed = avatarSeed(user), style, accessibilityLabel, accessible = Boolean(accessibilityLabel) }) {
  const tone = avatarTone(seed);
  return (
    <View accessible={accessible} accessibilityLabel={accessibilityLabel} accessibilityRole={accessible ? 'image' : undefined}
      style={[{ overflow: 'hidden', borderRadius: 9999, backgroundColor: tone.fill }, style, tone.ring && { borderWidth: 1, borderColor: tone.ring }]}>
      <Svg width="100%" height="100%" viewBox="0 0 512 512">
        <Circle cx="256" cy="256" r="256" fill={tone.fill} />
        <Circle cx="131" cy="234" r="30" fill={tone.face} />
        <Circle cx="380" cy="235" r="30" fill={tone.face} />
        <Path d="M224 287 Q255 335 287 287" fill="none" stroke={tone.face} strokeWidth="24" strokeLinecap="round" />
      </Svg>
    </View>
  );
}
