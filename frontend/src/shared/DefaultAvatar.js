import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from './theme';
import { memberAvatarTone } from './avatarColor';

// 기본 프로필(사진이 없을 때): 색 동그라미에 모아의 표정(눈 둘 · 웃는 입).
// 디스코드 기본 프로필처럼 사람마다 배경색이 다르다. 색은 계정 id(seed)로 고르므로 같은 사람은 같은 색이다.
// 공유 다이어리 참여자 목록에서도 '나'(user.self)는 참여자 색 대신 이 내 색을 써서, 마이페이지 · 편집기 · 공유 창의 내 얼굴이 같다(2026-11-07).
// seed 가 없으면(게스트 · 가입 전) 예전 기본색(primaryStrong) 파랑이다.
// 공유 다이어리 참여자는 서버가 정한 참여자 색(memberColor)을 color 로 받아, 밝은 12 · 어두운 12, 24색 중 하나로 맞춰 쓴다(shared/avatarColor).
// 눈 · 입은 마스코트 모아 최종 그림(docs/캐릭터 디자인/최종/모아 윤곽.svg, 2026-11-08)의 얼굴을 그대로 옮겼다(지라 592 · 588).
// 둥근 점 눈 둘 + 양끝이 둥근 선 입. 두 눈 사이 249 · 얼굴 묶음 가운데 (255.5, 265.7)는 예전 기본 프로필과 같게 두고 원본 비율 그대로 키웠다.
// style 에 width · height 를 주면 그 크기의 원이 된다(둥글게 자르는 것은 이 컴포넌트가 한다).
// 512 상자 좌표: 눈 [cx, cy, r] · 입(3차 곡선, 선 굵기 MOA_MOUTH_WIDTH)
const MOA_EYES = [[131.0, 241.4, 26.9], [380.0, 241.0, 27.1]];
const MOA_MOUTH = 'M223.0 280.0C228.9 317.8 279.3 320.9 287.7 280.0';
const MOA_MOUTH_WIDTH = 16;

// 배경 · 표정. 펜 기본 색에서 맨 앞 까망을 뺀 6색 — UI 색상 계열 밖이어도 귀여운 색으로. 흰 표정 대비는 모두 4.5:1 이상.
// 펜 팔레트를 바꿔도 사람마다 정해진 색이 바뀌지 않게 값을 따로 둔다(순서도 고정: id 해시가 이 순서를 고른다).
export const AVATAR_TONES = ['#A33C4B', '#917019', '#397A5B', '#34769F', '#7653A6', '#626878'].map(fill => ({ fill, face: '#FFFFFF', ring: null }));
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
  const member = user?.self ? null : memberAvatarTone(user?.color);
  const tone = member ? { fill: member.fill, face: member.light ? colors.text : '#FFFFFF', ring: null } : avatarTone(seed);
  return (
    <View accessible={accessible} accessibilityLabel={accessibilityLabel} accessibilityRole={accessible ? 'image' : undefined}
      style={[{ overflow: 'hidden', borderRadius: 9999, backgroundColor: tone.fill }, style, tone.ring && { borderWidth: 1, borderColor: tone.ring }]}>
      <Svg width="100%" height="100%" viewBox="0 0 512 512">
        <Circle cx="256" cy="256" r="256" fill={tone.fill} />
        {MOA_EYES.map(([cx, cy, r]) => <Circle key={cx} cx={cx} cy={cy} r={r} fill={tone.face} />)}
        <Path d={MOA_MOUTH} fill="none" stroke={tone.face} strokeWidth={MOA_MOUTH_WIDTH} strokeLinecap="round" />
      </Svg>
    </View>
  );
}
