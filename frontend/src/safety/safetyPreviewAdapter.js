// Isolated sample data, never installed in an authenticated production session.
export const sampleParticipants = [
  { id: 'self', nickname: '소연', role: 'EDITOR' },
  { id: 'host', nickname: '하루', role: 'OWNER' },
  { id: 'friend', nickname: '모아', role: 'EDITOR' },
  { id: 'past', nickname: '지난 계절', role: 'EDITOR', leftAt: '2026-10-01T00:00:00Z' },
  { id: 'withdrawn', nickname: '이전 이름', activeAccount: false, leftAt: '2026-09-01T00:00:00Z' },
];
export function createSafetyPreviewAdapter({ accountId = 'self', rows = sampleParticipants, now = () => new Date().toISOString() } = {}) {
  const blocks = new Map(), failures = new Set();
  let reports = 0;
  const check = async name => {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (failures.delete(name)) throw new Error('미리보기 요청 실패예요. 입력 내용은 유지돼요. 다시 시도해 주세요.');
  };
  return {
    mode: 'preview', accountId,
    failNext(name) { failures.add(name); },
    async listParticipants() { await check('participants'); return rows.map(row => ({ ...row })); },
    async listBlocks() { await check('list'); return [...blocks.values()]; },
    async block(id) {
      await check('block');
      const person = rows.find(row => row.id === id);
      if (!person || person.activeAccount === false || id === 'self') throw new Error('차단할 수 없는 사용자예요.');
      const row = { id, nickname: person.accountNickname || person.nickname, photoUri: person.photoUri, blockedAt: now() };
      blocks.set(id, row); return { ...row };
    },
    async unblock(id) { await check('unblock'); blocks.delete(id); },
    async report() { await check('report'); return { reportId: `preview-${++reports}` }; },
  };
}
