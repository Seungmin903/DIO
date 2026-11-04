export const REPORT_REASONS = [
  ['HARASSMENT', '욕설·괴롭힘'], ['HATE_DISCRIMINATION', '혐오·차별'], ['SEXUAL_CONTENT', '음란·성적 콘텐츠'],
  ['THREAT_PRIVACY', '위협·개인정보 침해'], ['CHILD_SAFETY', '아동·청소년 안전 침해'],
  ['SPAM_FRAUD', '스팸·사기'], ['RIGHTS_INFRINGEMENT', '저작권 등 권리 침해'], ['COLLABORATION_ABUSE', '공동 작업 방해'], ['OTHER', '기타'],
];
export const MAX_DESCRIPTION = 1000;
export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const UNAVAILABLE = '신고·차단 서버 연결을 준비하고 있어요. 아직 접수하거나 차단할 수 없어요.';

export function validateEvidence(photo) {
  if (!['image/png', 'image/jpeg'].includes(photo.mimeType)) return 'PNG 또는 JPEG 사진을 선택해 주세요.';
  if (!Number.isFinite(photo.size) || photo.size <= 0) return '사진 크기를 확인하지 못했어요. 다른 사진을 선택해 주세요.';
  if (photo.size > MAX_PHOTO_BYTES) return '사진은 한 장당 5MiB까지 첨부할 수 있어요.';
  return '';
}
export function validateReport({ reason, description, photos = [] }) {
  if (!REPORT_REASONS.some(([id]) => id === reason)) return '신고 사유를 선택해 주세요.';
  if (description != null && typeof description !== 'string') return '상세 설명을 확인해 주세요.';
  if (reason === 'OTHER' && !description?.trim()) return '기타 사유의 상세 설명을 입력해 주세요.';
  if (description?.length > MAX_DESCRIPTION) return '상세 설명은 1,000자까지 입력할 수 있어요.';
  if (photos.length > MAX_PHOTOS) return '사진은 최대 3장까지 첨부할 수 있어요.';
  return photos.map(validateEvidence).find(Boolean) || '';
}
export function normalizeParticipants(rows = []) {
  const unique = new Map();
  for (const row of rows) {
    const id = String(row.userId ?? row.id ?? '');
    if (!id) continue;
    const member = { ...row, id, nickname: row.activeAccount === false ? '탈퇴한 사용자' : row.nickname || '사용자',
      photoUri: row.activeAccount === false ? null : row.photoUri || row.profilePhotoUrl,
      participation: row.participation || (row.leftAt ? 'PAST' : 'CURRENT') };
    if (!unique.has(id) || member.participation === 'CURRENT') unique.set(id, member);
  }
  return [...unique.values()];
}
export function blockedParticipants(rows, blocks) {
  const ids = new Set(blocks.map(row => String(row.id)));
  return normalizeParticipants(rows).filter(row => row.participation === 'CURRENT' && ids.has(row.id));
}
export const warningKey = (accountId, diaryId) => `dio:safety:warning:${encodeURIComponent(accountId)}:${encodeURIComponent(diaryId)}`;
export const warningSignature = rows => [...new Set(rows.map(row => String(row.id)))].sort().join(',');
export const warningIsDismissed = (saved = [], rows) => rows.every(row => saved.includes(String(row.id)));

// The unconnected adapter never pretends that a local change is a server moderation action.
export function createUnavailableSafetyAdapter() {
  const reject = async () => { throw new Error(UNAVAILABLE); };
  return { mode: 'unavailable', listParticipants: reject, listBlocks: reject, block: reject, unblock: reject, report: reject };
}

/** Account/session-owned state. Only acknowledged mutations change the shared block list. */
export function createSafetyStore(adapter = createUnavailableSafetyAdapter()) {
  let snapshot = { blocks: [], status: 'idle', error: '', busy: false }, generation = 0, active = true;
  let loadRevision = 0;
  const listeners = new Set();
  const publish = change => { snapshot = { ...snapshot, ...change }; listeners.forEach(fn => fn()); };
  const check = revision => { if (!active || revision !== generation) throw new Error('계정이 변경되었어요. 화면을 다시 열어 주세요.'); };
  async function mutate(action, apply) {
    if (snapshot.busy) throw new Error('처리 중이에요. 잠시 기다려 주세요.');
    const revision = generation;
    check(revision); if (apply) loadRevision++;
    publish({ busy: true, error: '' });
    try {
      const result = await action(); check(revision); apply?.(result); return result;
    } catch (error) {
      if (active && revision === generation && error.code === 'BLOCK_REFRESH_REQUIRED') publish({ status: 'error', error: error.message });
      throw error;
    } finally { if (active && revision === generation) publish({ busy: false }); }
  }
  return {
    mode: adapter.mode,
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    activate() { active = true; },
    dispose() { active = false; generation++; loadRevision++; publish({ blocks: [], status: 'idle', error: '', busy: false }); },
    async refresh() {
      const revision = generation, job = ++loadRevision;
      publish({ status: 'loading', error: '' });
      try {
        const rows = await adapter.listBlocks(); check(revision);
        if (job !== loadRevision) return;
        const unique = new Map(rows.map(row => [String(row.userId ?? row.id), { ...row, id: String(row.userId ?? row.id) }]));
        publish({ blocks: [...unique.values()].sort((a, b) => Date.parse(b.blockedAt) - Date.parse(a.blockedAt)), status: 'ready' });
      } catch (error) {
        if (active && revision === generation && job === loadRevision) publish({ status: 'error', error: error.message });
      }
    },
    async participants(diaryId) {
      const revision = generation;
      const rows = await adapter.listParticipants(diaryId); check(revision);
      return normalizeParticipants(rows);
    },
    block(target, diaryId) {
      return mutate(() => adapter.block(target.id, diaryId), result => {
        if (!result?.blockedAt) throw new Error('차단 결과를 확인하지 못했어요. 다시 조회해 주세요.');
        publish({ blocks: [{ ...result, id: String(result.userId ?? target.id) }, ...snapshot.blocks.filter(row => row.id !== target.id)], status: 'ready' });
      });
    },
    unblock(target) { return mutate(() => adapter.unblock(target.id), () => publish({ blocks: snapshot.blocks.filter(row => row.id !== target.id), status: 'ready' })); },
    report(input) {
      const error = validateReport(input);
      if (error) return Promise.reject(new Error(error));
      return mutate(() => adapter.report(input));
    },
  };
}
