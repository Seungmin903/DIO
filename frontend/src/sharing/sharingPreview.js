import { createMockNotificationTransport } from '../notifications/mockNotificationTransport.js';
import { createNotificationApi } from '../notifications/notificationApi.js';
import { createSessionDocuments, readSessionDocument, writeSessionDocument } from '../editor/services/sessionDocuments.js';

// 공유 입력 규칙과 오류 형식은 sharingContracts.js 한 곳에서 정한다(서버 공유 API와 같은 규칙). 기존 import 경로를 위해 다시 내보낸다.
import { SharingError, normalizeSharingNickname, MAX_SHARING_MEMBERS, COPY_TITLE_LIMIT, copyTitleError, defaultCopyTitle, normalizeInviteEmail, inviteEmailError, sharingNicknameError } from './sharingContracts.js';
export { SharingError, normalizeSharingNickname, MAX_SHARING_MEMBERS, COPY_TITLE_LIMIT, copyTitleError, defaultCopyTitle, normalizeInviteEmail, inviteEmailError, sharingNicknameError };
const copy = (value) => JSON.parse(JSON.stringify(value));
const emptySharingTemplate = { version: 2, dateMode: 'dated', orientation: 'landscape', cover: false,
  dividers: false, monthly: false, weekly: false, daily: false, dailyTemplates: [], reusable: [], legacyEndPages: [] };
const fail = (code, message) => {
  throw new SharingError(code, message);
};

// 224 화면 검증용 메모리 서비스. 기존 알림 목 서버를 재사용하며 실제 링크/초대/권한을 만들지 않는다.
// seed: 예시 받은 초대(목업)를 넣어 둘지. 앱은 켜지 않는다(게스트에게 가짜 알림을 보이지 않는다).
export function createSharingPreview({ user = {}, delay = 250, now = Date.now, seed = true } = {}) {
  const self = { id: 'self', nickname: user.nickname || '방문자', photoUri: user.photoUri || null };
  const notifications = createMockNotificationTransport({
    account: 'sharing',
    delay,
    pageSize: 20,
    seed,
  });
  const documents = createSessionDocuments();
  const diaries = new Map();
  const personalCopies = new Map();
  const invites = new Map();
  const linkAttempts = new Map();
  const listeners = new Set();
  let active = true;
  let copyGeneration = 0;
  let serial = 0;
  let snapshot = { joined: [], diaries: [], library: [] };
  const publish = () => {
    const joined = [...diaries.values()].filter((value) =>
      value.members.some((member) => member.id === self.id && member.role !== 'OWNER'),
    );
    snapshot = {
      library: [...joined.filter(value => !value.localSource).map((value) => {
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
            : copy(emptySharingTemplate),
        };
      }), ...copy([...personalCopies.values()])],
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
      color: ['#F0B0AA', '#C3AEDD', '#A9AFD7', '#A9BFA6'][index],
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
    const current = await notifications.getInvitation(id, options);
    if (!active) fail('DISPOSED', '화면을 다시 열어 주세요.');
    const value = invites.get(id);
    if (!value) fail('NOT_FOUND', '초대를 찾을 수 없어요.');
    const diary = diaries.get(value.diary.diaryId);
    return copy({ ...value, status: current.status, memberCount: diary?.members.length || 0,
      full: (diary?.members.length || 0) >= MAX_SHARING_MEMBERS });
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
                color: '#A9AFD7',
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
      copyGeneration++;
      documents.dispose();
      personalCopies.clear();
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
          localSource: true,
          color: '#A9AFD7',
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
      const diary = personalCopies.get(id) || own(id);
      diary.favorite = !diary.favorite;
      publish();
      return copy(diary);
    },
    async createPersonalCopy(id, title) {
      const generation = copyGeneration;
      await wait();
      if (generation !== copyGeneration) fail('DISPOSED', '화면을 다시 열어 주세요.');
      const source = own(id);
      if (source.localSource) fail('UNAVAILABLE', '공유 다이어리에서 사본을 만들어 주세요.');
      const error = copyTitleError(title);
      if (error) fail('INVALID_TITLE', error);
      const copyId = `personal-copy-${++serial}`;
      const key = documents.key(copyId);
      const time = new Date(now()).toISOString();
      const result = { id: key, sessionStorageKey: key, title: title.trim(),
        color: source.color, pattern: source.pattern, type: '개인',
        canManage: false, canDelete: false, favorite: false, createdAt: time, updatedAt: time,
        templateConfig: copy(source.templateConfig || emptySharingTemplate) };
      const doc = readSessionDocument(documents.key(id));
      if (doc && !writeSessionDocument(key, copy(doc))) fail('COPY_FAILED', '사본을 만들지 못했어요. 다시 시도해 주세요.');
      personalCopies.set(key, result);
      publish();
      return copy(result);
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
      const diary = own(id);
      if (diary.members.length >= MAX_SHARING_MEMBERS)
        fail('DIARY_FULL', '소유자 포함 최대 4명까지 함께할 수 있어요.');
      const time = now();
      const attempts = (linkAttempts.get(id) || []).filter(value => time - value < 5 * 60 * 1000);
      if (attempts.length >= 3)
        fail('INVITE_RATE_LIMITED', '링크는 5분에 3번까지 만들 수 있어요. 잠시 후 다시 시도해 주세요.');
      linkAttempts.set(id, [...attempts, time]);
      diary.link = `https://dio.example/invite/preview-${++serial}`;
      diary.linkExpiresAt = new Date(time + 60 * 60 * 1000).toISOString();
      publish();
      return copy(diary);
    },
    async sendEmailInvite(id, email) {
      await wait();
      const diary = owner(id);
      if (inviteEmailError(email)) fail('INVALID_EMAIL', inviteEmailError(email));
      if (diary.members.length >= MAX_SHARING_MEMBERS)
        fail('DIARY_FULL', '소유자 포함 최대 4명까지 함께할 수 있어요.');
      const normalized = normalizeInviteEmail(email);
      diary.emailInvites ||= [];
      // 화면 확인용 기록이다. 가입 여부를 조회하거나 실제 메일·알림을 만들지 않는다.
      if (!diary.emailInvites.some(row => row.email === normalized && row.status === 'PENDING'))
        diary.emailInvites.unshift({ id: `email-${++serial}`, email: normalized, status: 'PENDING' });
      publish();
      return copy(diary);
    },
    async cancelEmailInvite(id, inviteId) {
      await wait();
      const diary = owner(id);
      const invite = diary.emailInvites?.find(row => row.id === inviteId);
      if (!invite) fail('NOT_FOUND', '초대를 찾을 수 없어요.');
      if (invite.status !== 'PENDING' && invite.status !== 'CANCELLED')
        fail('UNAVAILABLE', '이미 처리된 초대예요.');
      invite.status = 'CANCELLED';
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
      diary.link = null;
      delete diary.linkExpiresAt;
      publish();
      return copy(diary);
    },
    async transferOwner(id, memberId) {
      await wait();
      const diary = owner(id);
      const target = diary.members.find(value => value.id === memberId);
      if (!target || target.id === self.id || target.role !== 'EDITOR')
        fail('INVALID_MEMBER', '소유권을 받을 참여자를 다시 선택해 주세요.');
      member(diary).role = 'EDITOR';
      target.role = 'OWNER';
      diary.joinedAt ||= new Date().toISOString();
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
      if (diary.members.length >= MAX_SHARING_MEMBERS)
        fail('DIARY_FULL', '참여 인원이 가득 찼어요. 초대한 사람에게 문의해 주세요.');
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
    preview: {
      ...notifications,
      receiveInvitation({ title = '새로운 다이어리', inviter = '하루', members = [
        { id: 'host', nickname: inviter, role: 'OWNER', presence: '편집 중' },
      ] } = {}) {
        assertActive();
        notifications.add('PENDING');
        const incoming = notifications.inspect().invitations.at(-1);
        const diary = { id: incoming.diary.diaryId, title, color: '#A9AFD7', pattern: 'linen',
          members: copy(members), link: null, allowExport: true };
        diaries.set(diary.id, diary);
        invites.set(incoming.inviteId, { ...incoming, diary: { ...diary, diaryId: diary.id }, inviter });
        publish();
        return incoming.inviteId;
      },
    },
  };
}
