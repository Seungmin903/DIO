// 다이어리 목록 저장 형식. React/저장소를 모르는 순수 함수만 둔다.
import { COVER_PATTERNS, FIRST_PAGES, PAGE_SIZES, FALLBACK_COVER_COLOR } from '../constants.js';

import { normalizePaperAppearance } from '../../editor/templates/appearance.js';
import { normalizeTemplateConfig } from '../../editor/templates/creation.js';

function restoredTemplateConfig(value) {
  if (!value) return {};
  try { return { templateConfig: normalizeTemplateConfig(value) }; } catch { return {}; }
}

const DEFAULT_COLOR = FALLBACK_COVER_COLOR;

const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const oneOf = (options, value, fallback) => (options.some((option) => option.id === value) ? value : fallback);
const dateOnly = (value, fallback = null) => {
  if (typeof value !== 'string' || !/^2026-\d{2}-\d{2}$/.test(value)) return fallback;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : fallback;
};

// 표지 무늬가 없던 이전 다이어리는 무늬 없이(null) 그대로 둔다.
const coverOptions = (item) => ({
  pattern: oneOf(COVER_PATTERNS, item.pattern, null),
  pageSize: oneOf(PAGE_SIZES, item.pageSize, 'landscape'),
  firstPage: oneOf(FIRST_PAGES, item.firstPage, 'blank'),
  // 표지 요소(고무줄 · 제목 · 스티커 …). 그릴 때 coverDesign 의 normalizeCover 로 값을 맞춘다.
  ...(item.cover && typeof item.cover === 'object' && !Array.isArray(item.cover) ? { cover: item.cover } : {}),
});

/** 저장소에서 읽은 값을 화면에서 쓸 수 있는 목록으로 정리한다. 잘못된 항목과 중복 ID는 버린다. */
export function normalizeDiaries(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.flatMap((item) => {
    if (!item || !isText(item.id) || !isText(item.title) || seen.has(item.id)) return [];
    seen.add(item.id);
    return [{
      id: item.id,
      ...restoredTemplateConfig(item.templateConfig),
      ...(item.paperAppearance ? { paperAppearance: normalizePaperAppearance(item.paperAppearance) } : {}),
      title: item.title,
      color: isText(item.color) ? item.color : DEFAULT_COLOR,
      type: item.type === '공유' ? '공유' : '개인',
      favorite: item.favorite === true,
      ...(isText(item.createdAt) ? { createdAt: item.createdAt } : {}),
      updatedAt: isText(item.updatedAt) ? item.updatedAt : null,
      trashedAt: isText(item.trashedAt) ? item.trashedAt : null,
      ...(item.purgePending === true && item.trashedAt ? { purgePending: true } : {}),
      firstPageDate: dateOnly(item.firstPageDate),
      ...coverOptions(item),
    }];
  });
}

// 생성 시각은 createdAt에 둔다. 이전 다이어리는 ID(`diary-<생성 시각(ms)>`)에서 읽고, 둘 다 없으면 0으로 보고 기존 순서를 유지한다.
const createdTime = (diary) => Date.parse(diary.createdAt) || Number(/^diary-(\d+)$/.exec(diary.id)?.[1]) || 0;

/** 먼저 만든 다이어리가 앞(왼쪽)에 오도록 생성 순으로 정렬한다. */
export function sortByCreated(diaries) {
  return [...diaries].sort((a, b) => createdTime(a) - createdTime(b));
}

/**
 * 목록에 없지만 편집 문서만 남은 다이어리를 되살린다.
 * docEntries는 [저장 키, 문서 JSON 문자열] 배열이고, docKeyPrefix 뒤의 값을 다이어리 ID로 쓴다.
 */
export function recoverOrphanDiaries(diaries, docEntries, docKeyPrefix) {
  const known = new Set(diaries.map((diary) => diary.id));
  const recovered = [];
  for (const [key, value] of docEntries) {
    if (typeof key !== 'string' || !key.startsWith(`${docKeyPrefix}:`)) continue;
    const id = key.slice(docKeyPrefix.length + 1);
    if (!id || known.has(id)) continue;
    let doc;
    try { doc = JSON.parse(value); } catch { continue; }
    if (!doc || !Array.isArray(doc.pages) || !doc.pages.length) continue;
    known.add(id);
    recovered.push({
      id,
      ...restoredTemplateConfig(doc.templateConfig),
      ...(doc.paperAppearance ? { paperAppearance: normalizePaperAppearance(doc.paperAppearance) } : {}),
      title: isText(doc.title) ? doc.title : '복구한 다이어리',
      color: isText(doc.coverColor) ? doc.coverColor : DEFAULT_COLOR,
      type: '개인',
      favorite: false,
      ...(isText(doc.createdAt) ? { createdAt: doc.createdAt } : {}),
      updatedAt: null,
      trashedAt: null,
      firstPageDate: null,
      ...coverOptions({ pattern: doc.coverPattern, pageSize: doc.orientation }),
    });
  }
  return recovered.length ? [...diaries, ...recovered] : diaries;
}

/** ISO 시각을 목록·상세에 보여줄 상대 시간으로 바꾼다. 알 수 없으면 '기록 없음'. */
export function formatUpdatedAt(value, now = new Date()) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '기록 없음';
  const minutes = Math.floor((now.getTime() - time) / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  const date = new Date(time);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}
