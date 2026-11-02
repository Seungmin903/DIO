import { bioError, nicknameError, normalizeBio, normalizeNickname } from './validation.js';

const fail = (message) => {
  throw new Error(message);
};
const text = (value) => (typeof value === 'string' ? value : '');
// 기본 프로필 색을 고를 값. 게스트는 계정 id 가 없어 처음 시작할 때 한 번 뽑아 기기에 남긴다(같은 기기에선 늘 같은 색).
const SEED = /^[a-z0-9]{6,32}$/;
const randomSeed = () => Math.random().toString(36).slice(2, 12).padEnd(6, '0');

// 저장된 값에서 쓸 수 있는 칸만 걸러 낸다. 손상된 값은 없는 것으로 본다.
function clean(saved) {
  const nickname = text(saved?.nickname),
    bio = text(saved?.bio),
    photoUri = text(saved?.photoUri).trim(),
    avatarSeed = text(saved?.avatarSeed);
  return {
    ...(SEED.test(avatarSeed) && { avatarSeed }),
    ...(!nicknameError(nickname) && { nickname: normalizeNickname(nickname) }),
    ...(!bioError(bio) && normalizeBio(bio) && { bio: normalizeBio(bio) }),
    ...(photoUri && { photoUri }),
  };
}
// 세션 사용자에 프로필을 얹는다. 비어 있는 칸은 키째 뺀다.
const merge = (user, profile) => {
  const { bio, photoUri, ...rest } = user;
  return { ...rest, ...clean(profile) };
};

/**
 * 게스트 프로필: 로그인한 회원처럼 닉네임 · 한 줄 소개 · 사진을 고치고, 기기에 남긴다.
 * load / save 는 기기 저장소, keepPhoto 는 고른 사진을 앱이 지우지 않는 자리로 옮기는 함수, releasePhoto 는 그렇게 옮겨 둔 파일을 지우는 함수다.
 * 사진 파일은 저장이 성공한 뒤에만 이전 것을 지우고, 저장이 실패하면 방금 옮긴 새 것을 지운다.
 */
export function createGuestProfile({ load, save, keepPhoto = async (uri) => uri, releasePhoto = async () => {}, newSeed = randomSeed }) {
  return {
    /** 게스트로 시작할 때: 지난번에 고친 프로필을 얹은 사용자를 돌려준다. 기본 프로필 색 값이 없으면 뽑아 남긴다. */
    async start(user) {
      let saved;
      try {
        saved = await load();
      } catch {
        return user;
      }
      if (clean(saved).avatarSeed) return merge(user, saved);
      const next = { ...(saved && typeof saved === 'object' ? saved : {}), avatarSeed: newSeed() };
      try {
        await save(next);
      } catch {}
      return merge(user, next);
    },
    async updateProfile(user, { nickname, photoUri = null, bio = '' }) {
      if (nicknameError(nickname)) fail(nicknameError(nickname));
      if (bioError(bio)) fail(bioError(bio));
      if (photoUri !== null && (typeof photoUri !== 'string' || !photoUri.trim()))
        fail('사진을 다시 선택해 주세요.');
      const moved = !!photoUri && photoUri !== user.photoUri;
      const kept = moved ? await keepPhoto(photoUri) : photoUri;
      const profile = { nickname: normalizeNickname(nickname), bio: normalizeBio(bio), photoUri: kept, ...(user.avatarSeed && { avatarSeed: user.avatarSeed }) };
      let saved = false;
      try {
        saved = !!(await save(profile));
      } catch {
        saved = false;
      }
      if (!saved) {
        if (moved) await releasePhoto(kept).catch(() => {});
        fail('프로필을 저장하지 못했어요. 다시 시도해 주세요.');
      }
      if (user.photoUri && user.photoUri !== kept) await releasePhoto(user.photoUri).catch(() => {});
      return merge(user, profile);
    },
  };
}
