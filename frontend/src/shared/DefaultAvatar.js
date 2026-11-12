import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { avatarSeed, avatarTone } from './avatarTone';

// 기본 프로필(사진이 없을 때): 색 동그라미에 모아의 표정(눈 둘 · 웃는 입).
// 디스코드 기본 프로필처럼 사람마다 배경색이 다르다. 색은 계정 id(seed)로 고르므로 같은 사람은 같은 색이다.
// seed 가 없으면(게스트 · 가입 전) 예전 기본색(primaryStrong) 파랑이다.
// 공유 다이어리 참여자도 서버 참여자 색(memberColor) 대신 같은 계정 id 색을 쓴다. 서버 색은 다이어리마다 따로 뽑혀(방장은 모두 같은 색)
// 같은 사람이 참여자 시트와 차단 목록 · 다른 다이어리에서 다른 색으로 보였다(2026-11-08 지라 638). 앱은 서버 색을 얼굴 말고는 쓰지 않는다.
// 눈 · 입은 마스코트 모아 최종 그림(docs/캐릭터 디자인/최종/모아 윤곽.svg, 2026-11-08)의 얼굴을 그대로 옮겼다(지라 592 · 588).
// 둥근 점 눈 둘 + 양끝이 둥근 선 입. 두 눈 사이 249 · 얼굴 묶음 가운데 (255.5, 265.7)는 예전 기본 프로필과 같게 두고 원본 비율 그대로 키웠다.
// style 에 width · height 를 주면 그 크기의 원이 된다(둥글게 자르는 것은 이 컴포넌트가 한다).
// 512 상자 좌표: 눈 [cx, cy, r] · 입(3차 곡선, 선 굵기 MOA_MOUTH_WIDTH)
const MOA_EYES = [[131.0, 241.4, 26.9], [380.0, 241.0, 27.1]];
const MOA_MOUTH = 'M223.0 280.0C228.9 317.8 279.3 320.9 287.7 280.0';
const MOA_MOUTH_WIDTH = 16;

// 색 고르기(avatarTone · avatarSeed)는 그림과 떼어 shared/avatarTone.js 에 둔다(노드 테스트가 직접 불러 검증한다)
export { AVATAR_TONES, GUEST_AVATAR_TONE, avatarSeed, avatarTone } from './avatarTone';

// user: 계정({ userId } · { accountId } · 공유 참여자 { id, color }). seed 를 직접 줄 수도 있다.
export default function DefaultAvatar({ user, seed = avatarSeed(user), style, accessibilityLabel, accessible = Boolean(accessibilityLabel) }) {
  const tone = avatarTone(seed);
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
