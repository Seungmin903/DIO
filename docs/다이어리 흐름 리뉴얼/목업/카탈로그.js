// 속지 분류와 '속지마다 보이는 옵션' 규칙 — 네 안이 모두 이 규칙을 쓴다
// 옵션 층위
//   1층 (늘 보임): 이름 · 표지 · 속지
//   2층 (고른 속지에 필요할 때만): 기간(날짜가 인쇄되는 플래너) / 장수(날짜 없는 속지) / 날짜 적기(일기)
//   3층 (접혀 있음, '속지 스타일'): 종이 색 · 선 색 · 글씨체 — 글씨가 인쇄되지 않는 속지는 글씨체를 숨긴다
const GROUPS = [
  { id: 'note', name: '노트', desc: '날짜 없이 자유롭게', icon: '📝' },
  { id: 'planner', name: '플래너', desc: '날짜가 적힌 달력 · 주간', icon: '🗓️' },
  { id: 'diary', name: '일기', desc: '하루 한 장', icon: '📔' },
  { id: 'hobby', name: '덕질 · 취미', desc: '직관 · 공연 · 여행', icon: '🎟️' },
  { id: 'season', name: '시즌 한정', desc: '기간 동안만 새로 고를 수 있어요', icon: '🎃' },
]
// kind: 렌더.js 의 pageSVG 종류. type 이 옵션을 정한다: note | planner | diary | hobby
const PAPERS = [
  { id: 'plain', group: 'note', name: '무지', kinds: ['note-plain'], type: 'note' },
  { id: 'ruled', group: 'note', name: '줄', kinds: ['note-ruled'], type: 'note' },
  { id: 'grid', group: 'note', name: '모눈', kinds: ['note-grid'], type: 'note' },
  { id: 'dots', group: 'note', name: '도트', kinds: ['note-dots'], type: 'note' },
  { id: 'year', group: 'planner', name: '1년 플래너', sub: '월간 + 주간', kinds: ['monthly', 'weekly'], type: 'planner', rec: true, set: true },
  { id: 'monthly', group: 'planner', name: '월간 달력', kinds: ['monthly'], type: 'planner' },
  { id: 'weekly', group: 'planner', name: '주간 · 블록', kinds: ['weekly'], type: 'planner' },
  { id: 'weekly-journal', group: 'planner', name: '주간 · 저널', kinds: ['weekly-journal'], type: 'planner' },
  { id: 'daily', group: 'planner', name: '하루 계획', kinds: ['daily'], type: 'planner' },
  { id: 'diary', group: 'diary', name: '하루 일기', kinds: ['diary'], type: 'diary', rec: true },
  { id: 'photo', group: 'diary', name: '사진 일기', kinds: ['scrap'], type: 'diary' },
  { id: 'baseball', group: 'hobby', name: '야구 직관', kinds: ['baseball'], type: 'hobby', badge: 'NEW' },
  { id: 'soccer', group: 'hobby', name: '축구 직관', kinds: ['soccer'], type: 'hobby' },
  { id: 'concert', group: 'hobby', name: '콘서트', kinds: ['concert'], type: 'hobby' },
  { id: 'musical', group: 'hobby', name: '뮤지컬 · 연극', kinds: ['musical'], type: 'hobby' },
  { id: 'travel', group: 'hobby', name: '여행', kinds: ['travel'], type: 'hobby' },
  { id: 'halloween', group: 'season', name: '할로윈', kinds: ['halloween'], type: 'hobby', until: '~10.31' },
  { id: 'christmas', group: 'season', name: '크리스마스', kinds: ['christmas'], type: 'hobby', until: '12월' },
]
const paperById = (id) => PAPERS.find((p) => p.id === id)
const papersIn = (g) => PAPERS.filter((p) => p.group === g)
// 2층 옵션: 이 속지에 무엇이 보이나
const optionsFor = (paper) => ({
  period: paper.type === 'planner', // 연도 · 시작 달 · 개월
  weekStart: paper.type === 'planner' && paper.kinds.some((k) => k === 'monthly' || k.startsWith('weekly')),
  count: paper.type !== 'planner', // 장수
  dateStamp: paper.type === 'diary', // 날짜 미리 적기
  font: paper.type !== 'note', // 3층: 인쇄된 글씨가 있을 때만 글씨체
  lineColor: paper.id !== 'plain', // 무지는 선이 없다
})
const COUNT_STEPS = [10, 30, 50, 100]
// 표지 기본 디자인 (1층에서 바로 고르는 것). 사진 · 제목 스타일 · 스티커는 '표지 꾸미기'(2층)
const COVER_PRESETS = [
  { id: 'peri', name: '페리윙클', color: '#9DABD8', pattern: 'linen', style: 'label', font: 'gothic', tcolor: '#3B3F4A' },
  { id: 'sage', name: '세이지', color: '#A9BFA6', pattern: 'linen', style: 'label', font: 'myeongjo', tcolor: '#3B3F4A' },
  { id: 'rose', name: '로즈', color: '#F0B0AA', pattern: 'dot', style: 'label', font: 'poor', tcolor: '#5B3A3A' },
  { id: 'charcoal', name: '차콜', color: '#474F55', pattern: 'leather', style: 'label', font: 'myeongjo', tcolor: '#3B3F4A' },
  { id: 'mustard', name: '머스터드', color: '#EBC56F', pattern: 'gingham', style: 'label', font: 'gothic', tcolor: '#3B3F4A' },
  { id: 'photo', name: '사진 표지', color: '#BFD3EA', pattern: 'none', photo: 0, style: 'none', font: 'pen', tcolor: '#FFFFFF', stickers: [['blossom', 60, 58, 20]] },
  { id: 'baseball', name: '야구', color: '#2F6B4F', pattern: 'stripe', style: 'label', font: 'nanumgothic', tcolor: '#2F6B4F', stickers: [['star', 66, 74, 15]] },
  { id: 'halloween', name: '할로윈', color: '#D2691E', pattern: 'dot', style: 'ribbon', font: 'poor', tcolor: '#4A2A10', stickers: [['moon', 62, 12, 20]], until: '~10.31' },
]
const coverState = (preset, extra = {}) => ({ ...preset, photoX: 0, photoY: 0, photoZoom: 1, pos: 'top', align: 'left', band: true, tsize: 16, stickers: (preset.stickers ?? []).map(([name, x, y, size], i) => ({ id: 'k' + i, name, x, y, size })), ...extra })

// 장수 · 기간 계산
function weeksIn(y, m, ws) { let n = 0; const last = new Date(y, m, 0).getDate(); for (let d = 1; d <= last; d++) if (new Date(y, m - 1, d).getDay() === ws) n++; return n }
function pagePlan(paper, o) {
  // o: { year, start, months, weekStart, count, dateStamp }
  const out = [{ kind: 'cover-page', o: { year: o.year, dated: paper.type === 'planner' } }]
  if (paper.type === 'planner') {
    for (let i = 0; i < o.months; i++) {
      const m0 = o.start - 1 + i, year = o.year + Math.floor(m0 / 12), month = (m0 % 12) + 1, base = { year, month, weekStart: o.weekStart }
      if (paper.set || paper.kinds.length > 1 || paper.kinds[0] === 'monthly') out.push({ kind: 'divider', o: base, label: `${month}월` })
      for (const k of paper.kinds) {
        const n = k === 'monthly' ? 1 : k.startsWith('weekly') ? weeksIn(year, month, o.weekStart) : k === 'daily' ? new Date(year, month, 0).getDate() : 1
        for (let j = 0; j < n; j++) out.push({ kind: k, o: { ...base, week: j, day: j + 1 }, label: KIND_NAMES[k] + (k === 'monthly' ? ` ${month}월` : '') })
      }
    }
  } else for (let j = 0; j < o.count; j++) out.push({ kind: paper.kinds[j % paper.kinds.length], o: { year: o.year, month: o.start, day: j + 1, dated: paper.type === 'diary' ? o.dateStamp : false }, label: paper.name })
  return out
}
const periodLabel = (o) => { const a = o.start, endM0 = o.start - 1 + o.months - 1, ey = o.year + Math.floor(endM0 / 12), em = (endM0 % 12) + 1; return `${o.year}.${String(a).padStart(2, '0')} – ${ey !== o.year ? ey + '.' : ''}${String(em).padStart(2, '0')}` }
