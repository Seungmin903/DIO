import { createMockNotificationTransport } from '../notifications/mockNotificationTransport.js';
import { createNotificationApi } from '../notifications/notificationApi.js';
import { createSessionDocuments } from '../editor/services/sessionDocuments.js';

export class SharingError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
export const normalizeSharingNickname = (value) => value.trim().normalize('NFKC');
export const sharingNicknameError = (value) =>
  /^[가-힣a-zA-Z0-9_]{2,12}$/.test(normalizeSharingNickname(value))
    ? ''
    : '한글·영문·숫자·밑줄로 2~12자를 입력해 주세요.';
const copy = (value) => JSON.parse(JSON.stringify(value));
const fail = (code, message) => {
  throw new SharingError(code, message);
};

// 224 화면 검증용 메모리 서비스. 기존 알림 목 서버를 재사용하며 실제 링크/초대/권한을 만들지 않는다.
export function createSharingPreview({ user = {}, delay = 250 } = {}) {
  const self = { id: 'self', nickname: user.nickname || '방문자', photoUri: user.photoUri || null };
  const notifications = createMockNotificationTransport({
    account: 'sharing',
    delay,
    pageSize: 20,
  });
  const documents = createSessionDocuments();
  const diaries = new Map();
  const invites = new Map();
  const listeners = new Set();
  let active = true;
  let serial = 0;
  let snapshot = { joined: [], diaries: [], library: [] };
  const publish = () => {
    const joined = [...diaries.values()].filter((value) =>
      value.members.some((member) => member.id === self.id && member.role !== 'OWNER'),
    );
    snapshot = {
      library: joined.map((value) => {
        const key = documents.key(value.id);
        return {
          id: key,
          sharedDiaryId: value.id,
          sessionStorageKey: key,
          title: value.title,
          color: value.color,
          pattern: value.pattern,
          type: '공유',
          canManage: false,
          favorite: !!value.favorite,
          createdAt: value.joinedAt,
          updatedAt: value.joinedAt,
          templateConfig: value.templateConfig
            ? copy(value.templateConfig)
            : {
                version: 2,
                dateMode: 'dated',
                orientation: 'landscape',
                cover: false,
                dividers: false,
                monthly: false,
                weekly: false,
                daily: false,
                dailyTemplates: [],
                reusable: [],
                legacyEndPages: [],
              },
        };
      }),
      diaries: copy([...diaries.values()]),
      joined: copy(
        [...diaries.values()].filter((value) =>
          value.members.some((member) => member.id === self.id && member.role !== 'OWNER'),
        ),
      ),
    };
    listeners.forEach((listener) => listener());
  };
  const wait = async () => {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (!active) fail('DISPOSED', '화면을 다시 열어 주세요.');
  };
  notifications.inspect().invitations.forEach((invite, index) => {
    const title = ['우리의 여행 기록', '함께하는 오후', '지난 초대', '주말의 기록'][index];
    const diary = {
      id: invite.diary.diaryId,
      title,
      color: ['#F0B0AA', '#C3AEDD', '#9DABD8', '#A9BFA6'][index],
      pattern: 'linen',
    };
    diaries.set(diary.id, {
      ...diary,
      allowExport: true,
      members: [
        { id: 'host', nickname: '하루', role: 'OWNER', presence: '편집 중' },
        { id: 'friend', nickname: '모아', role: 'EDITOR', presence: '자리 비움' },
      ],
      link: null,
    });
    invites.set(invite.inviteId, {
      ...invite,
      diary: { ...diary, diaryId: diary.id },
      inviter: '하루',
    });
  });
  const assertActive = () => {
    if (!active) fail('DISPOSED', '화면을 다시 열어 주세요.');
  };
  const member = (diary) => diary.members.find((value) => value.id === self.id);
  const own = (id) => {
    assertActive();
    const diary = diaries.get(id);
    if (!diary || !member(diary)) fail('FORBIDDEN', '이 다이어리에 참여하고 있지 않아요.');
    return diary;
  };
  const owner = (id) => {
    const diary = own(id);
    if (member(diary).role !== 'OWNER') fail('FORBIDDEN', '소유자만 변경할 수 있어요.');
    return diary;
  };
  const detail = async (id, options = {}) => {
    const current = await notifications.transport({
      path: `/me/invitations/${encodeURIComponent(id)}`,
      ...options,
    });
    if (!active) fail('DISPOSED', '화면을 다시 열어 주세요.');
    const value = invites.get(id);
    if (!value) fail('NOT_FOUND', '초대를 찾을 수 없어요.');
    return copy({ ...value, status: current.status });
  };
  const pending = async (id) => {
    const invite = await detail(id);
    if (invite.status !== 'PENDING')
      fail('UNAVAILABLE', '사용할 수 없는 초대예요. 새 초대를 요청해 주세요.');
    return invite;
  };
  const validateNickname = (diary, nickname) => {
    const error = sharingNicknameError(nickname);
    if (error) fail('INVALID_NICKNAME', error);
    const normalized = normalizeSharingNickname(nickname).toLowerCase();
    if (
      diary.members.some(
        (value) => value.id !== self.id && value.nickname.toLowerCase() === normalized,
      )
    ) {
      fail('DUPLICATE_NICKNAME', '이미 사용 중인 닉네임이에요.');
    }
  };
  const transport = async (request) => {
    const result = await notifications.transport(request);
    if (request.path === '/notifications')
      return {
        ...result,
        items: result.items.map((row) => ({
          ...row,
          diary: invites.get(row.invitation.inviteId)?.diary || row.diary,
          actor: { nickname: '하루' },
        })),
      };
    return result;
  };
  const notificationApi = createNotificationApi(transport);
  return {
    self,
    hasMembership(id) {
      const invite = invites.get(id);
      return !!invite && !!member(diaries.get(invite.diary.diaryId));
    },
    notificationApi: {
      ...notificationApi,
      async list(options) {
        const result = await notificationApi.list(options);
        return {
          ...result,
          items: result.items.map((row) => ({
            ...row,
            diary: copy(
              invites.get(row.inviteId)?.diary || {
                title: row.title,
                color: '#9DABD8',
                pattern: 'linen',
              },
            ),
          })),
        };
      },
    },
    invitationGateway: { get: detail },
    getSnapshot: () => snapshot,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    activate() {
      active = true;
      documents.activate();
      publish();
    },
    // 계정 수정은 이후 새 다이어리에 복사할 기본값만 갱신한다. 기존 참여자 프로필은 유지한다.
    setAccountProfile(user = {}) {
      self.nickname = user.nickname || '방문자';
      self.photoUri = user.photoUri || null;
    },
    dispose() {
      active = false;
      documents.dispose();
    },
    // 이미 존재하는 로컬 다이어리는 소유자용 공유 UI에만 등록한다. 원본 객체와 저장소를 변경하지 않는다.
    registerDiary(source) {
      assertActive();
      if (source?.sharedDiaryId) return copy(own(source.sharedDiaryId));
      if (!source?.id) fail('INVALID_DIARY', '다이어리를 먼저 열어 주세요.');
      const metadata = {};
      for (const key of ['title', 'color', 'pattern', 'templateConfig']) {
        if (source[key] !== undefined) metadata[key] = copy(source[key]);
      }
      if (!diaries.has(source.id))
        diaries.set(source.id, {
          id: source.id,
          color: '#9DABD8',
          pattern: 'linen',
          ...metadata,
          allowExport: true,
          members: [
            { ...self, role: 'OWNER', presence: '편집 중' },
          ],
          link: null,
        });
      else Object.assign(diaries.get(source.id), metadata);
      publish();
      return copy(own(source.id));
    },
    toggleFavorite(id) {
      const diary = own(id);
      diary.favorite = !diary.favorite;
      publish();
      return copy(diary);
    },
    async resolveLink(value) {
      const match = /^https:\/\/dio\.example\/invite\/([^/?#]+)\/?$/.exec(value.trim());
      if (!match) fail('UNAVAILABLE', '사용할 수 없는 초대 링크예요.');
      if ([...diaries.values()].some((diary) => diary.link === value.trim()))
        fail('ALREADY_JOINED', '이미 참여 중인 다이어리예요.');
      let id;
      try {
        id = decodeURIComponent(match[1]);
      } catch {
        fail('UNAVAILABLE', '사용할 수 없는 초대 링크예요.');
      }
      return pending(id);
    },
    async getSharing(id) {
      await wait();
      return copy(own(id));
    },
    async createLink(id) {
      await wait();
      const diary = owner(id);
      diary.link = `https://dio.example/invite/preview-${++serial}`;
      publish();
      return copy(diary);
    },
    async setExportAllowed(id, allowed) {
      await wait();
      const diary = owner(id);
      diary.allowExport = Boolean(allowed);
      publish();
      return copy(diary);
    },
    async checkProfileNickname(id, nickname) {
      await wait();
      validateNickname(own(id), nickname);
      return normalizeSharingNickname(nickname);
    },
    async updateProfile(id, { nickname, photoUri }) {
      await wait();
      const diary = own(id);
      validateNickname(diary, nickname);
      if (photoUri !== null && (typeof photoUri !== 'string' || !photoUri.trim()))
        fail('INVALID_PHOTO', '사진을 다시 선택해 주세요.');
      Object.assign(member(diary), { nickname: normalizeSharingNickname(nickname), photoUri });
      publish();
      return copy(diary);
    },
    async setProfilePhoto(id, photoUri) {
      await wait();
      if (photoUri !== null && (typeof photoUri !== 'string' || !photoUri.trim()))
        fail('INVALID_PHOTO', '사진을 다시 선택해 주세요.');
      const diary = own(id);
      member(diary).photoUri = photoUri;
      publish();
      return copy(diary);
    },
    async removeMember(id, memberId) {
      await wait();
      const diary = owner(id);
      const target = diary.members.find((value) => value.id === memberId);
      if (!target || target.role === 'OWNER') fail('FORBIDDEN', '소유자는 참여 해제할 수 없어요.');
      diary.members = diary.members.filter((value) => value.id !== memberId);
      publish();
      return copy(diary);
    },
    async checkNickname(id, nickname) {
      const invite = await pending(id);
      await wait();
      validateNickname(diaries.get(invite.diary.diaryId), nickname);
      return normalizeSharingNickname(nickname);
    },
    async accept(id, nickname, { photoUri = self.photoUri } = {}) {
      if (photoUri !== null && (typeof photoUri !== 'string' || !photoUri.trim()))
        fail('INVALID_PHOTO', '사진을 다시 선택해 주세요.');
      await pending(id);
      await wait();
      // 최종 반영 직전에 다시 검사한다. 만료/취소 또는 동시에 수락한 이전 응답을 적용하지 않는다.
      const invite = await pending(id),
        diary = diaries.get(invite.diary.diaryId);
      validateNickname(diary, nickname);
      assertActive();
      if (member(diary)) fail('ALREADY_JOINED', '이미 참여 중인 다이어리예요.');
      diary.members.push({
        ...self,
        nickname: normalizeSharingNickname(nickname),
        photoUri,
        role: 'EDITOR',
        presence: '편집 중',
      });
      diary.joinedAt = new Date().toISOString();
      notifications.setInvitationStatus(id, 'ACCEPTED');
      publish();
      return copy(diary);
    },
    async decline(id) {
      await wait();
      await pending(id);
      assertActive();
      notifications.setInvitationStatus(id, 'DECLINED');
      publish();
    },
    async leave(id) {
      await wait();
      const diary = own(id);
      if (member(diary).role === 'OWNER') fail('FORBIDDEN', '소유자는 참여 해제할 수 없어요.');
      diary.members = diary.members.filter((value) => value.id !== self.id);
      documents.release(id);
      publish();
    },
    // 회귀 테스트에서 최종 상태 변경을 주입하는 경계. 제품 화면에는 노출하지 않는다.
    preview: notifications,
  };
}
