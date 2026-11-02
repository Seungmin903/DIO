import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from './theme';
import { EDITOR_COLORS } from '../editor/utils/penSettings';
import { memberAvatarTone } from './avatarColor';

// 기본 프로필(사진이 없을 때): 색 동그라미에 모아의 표정(눈 둘 · 웃는 입).
// 디스코드 기본 프로필처럼 사람마다 배경색이 다르다. 색은 계정 id(seed)로 고르므로 같은 사람은 어디서나 같은 색이다.
// seed 가 없으면(게스트 · 가입 전) 예전 기본색(primaryStrong) 파랑이다.
// 공유 다이어리 참여자는 서버가 정한 참여자 색(memberColor)을 color 로 받아, 밝은 12 · 어두운 12, 24색 중 하나로 맞춰 쓴다(shared/avatarColor).
// 예전 avatar-default.png(512px 래스터)는 확대하면 눈 · 입 가장자리가 계단처럼 거칠어, 같은 위치 · 비율로 벡터로 다시 그렸다.
// 눈 · 입은 마스코트 모아(assets/characters/moa-line.png)의 얼굴 윤곽을 그대로 따서 벡터로 옮겼다(2026-11-02).
// 손그림 눈(살짝 납작한 타원)과 양끝이 올라간 입(선 굵기가 고르지 않다)까지 같고, 두 눈 가운데 (255.5, 234.5) · 눈 사이 249 로 맞췄다(원본의 0.64배).
// style 에 width · height 를 주면 그 크기의 원이 된다(둥글게 자르는 것은 이 컴포넌트가 한다).
const MOA_LEFT_EYE = 'M131.4 212.6Q126.3 212.6 121.5 214.9Q116.7 217.1 114.4 220.0Q112.2 222.9 110.9 226.4Q109.6 229.9 109.6 234.7Q109.6 239.5 111.2 243.3Q112.8 247.2 116.4 250.7Q119.9 254.2 123.4 255.5Q126.9 256.8 129.8 256.8Q132.7 256.8 137.5 255.2Q142.3 253.6 145.5 250.7Q148.7 247.8 150.6 243.0Q152.5 238.2 152.5 234.4Q152.5 230.5 150.6 225.7Q148.7 220.9 146.8 218.7Q144.8 216.5 140.7 214.5Q136.5 212.6 131.4 212.6Z';
const MOA_RIGHT_EYE = 'M389.0 213.9Q386.1 212.6 381.3 212.6Q376.5 212.6 373.0 213.9Q369.5 215.2 366.0 218.4Q362.4 221.6 360.5 225.7Q358.6 229.9 358.6 234.4Q358.6 238.9 360.5 243.3Q362.4 247.8 364.7 250.4Q366.9 252.9 370.1 254.5Q373.3 256.1 377.2 256.5Q381.0 256.8 385.8 255.5Q390.6 254.2 393.8 251.3Q397.0 248.5 398.9 244.6Q400.8 240.8 400.8 234.4Q400.8 228.0 399.2 224.5Q397.6 220.9 394.8 218.1Q391.9 215.2 389.0 213.9Z';
const MOA_MOUTH = 'M293.3 287.5Q293.3 283.7 291.7 281.7Q290.1 279.8 288.8 279.2Q287.6 278.5 285.3 278.9Q283.1 279.2 282.1 280.1Q281.2 281.1 277.6 288.1Q274.1 295.2 270.9 298.1Q267.7 300.9 263.2 302.5Q258.8 304.1 255.9 304.1Q253.0 304.1 246.9 301.6Q240.8 299.0 238.9 297.1Q237.0 295.2 234.1 290.1Q231.2 284.9 228.7 282.7Q226.1 280.5 224.8 280.1Q223.6 279.8 222.0 280.5Q220.4 281.1 219.1 283.0Q217.8 284.9 217.5 286.9Q217.2 288.8 219.7 295.5Q222.3 302.2 226.4 306.7Q230.6 311.2 236.7 314.1Q242.8 316.9 244.4 316.9Q246.0 316.9 248.8 317.9Q251.7 318.9 256.5 318.9Q261.3 318.9 265.8 317.6Q270.3 316.3 275.4 313.4Q280.5 310.5 283.7 307.3Q286.9 304.1 290.1 297.7Q293.3 291.3 293.3 287.5Z';

// 배경 · 표정. 펜 색(EDITOR_COLORS)에서 맨 앞 까망을 뺀 6색 — UI 색상 계열 밖이어도 귀여운 색으로. 흰 표정 대비는 모두 4.5:1 이상.
export const AVATAR_TONES = EDITOR_COLORS.slice(1).map(fill => ({ fill, face: '#FFFFFF', ring: null }));
// seed 가 없을 때(게스트 · 가입 전) 쓰는 기본색: 예전 기본 프로필 파랑
export const GUEST_AVATAR_TONE = { fill: colors.primaryStrong, face: '#FFFFFF', ring: null };

/** 기본 프로필 색을 고를 id. 회원은 userId(공유 참여자 id 와 같다), 미리보기 계정은 accountId. 게스트는 id 가 없어 늘 GUEST_AVATAR_TONE 이다 */
export const avatarSeed = user => String(user?.userId ?? user?.accountId ?? user?.id ?? '');

export function avatarTone(seed) {
  const text = seed == null ? '' : String(seed);
  if (!text) return GUEST_AVATAR_TONE;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

// user: 계정({ userId } · { accountId } · 공유 참여자 { id, color }). seed 를 직접 줄 수도 있다.
export default function DefaultAvatar({ user, seed = avatarSeed(user), style, accessibilityLabel, accessible = Boolean(accessibilityLabel) }) {
  const member = memberAvatarTone(user?.color);
  const tone = member ? { fill: member.fill, face: member.light ? colors.text : '#FFFFFF', ring: null } : avatarTone(seed);
  return (
    <View accessible={accessible} accessibilityLabel={accessibilityLabel} accessibilityRole={accessible ? 'image' : undefined}
      style={[{ overflow: 'hidden', borderRadius: 9999, backgroundColor: tone.fill }, style, tone.ring && { borderWidth: 1, borderColor: tone.ring }]}>
      <Svg width="100%" height="100%" viewBox="0 0 512 512">
        <Circle cx="256" cy="256" r="256" fill={tone.fill} />
        <Path d={MOA_LEFT_EYE} fill={tone.face} />
        <Path d={MOA_RIGHT_EYE} fill={tone.face} />
        <Path d={MOA_MOUTH} fill={tone.face} />
      </Svg>
    </View>
  );
}
