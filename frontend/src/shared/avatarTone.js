import { colors } from './theme.js';

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

