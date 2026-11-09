import bundle from './legalContent.json' with { type: 'json' };
import { keepKoreanWords } from './keepWords.js';

const CONSENT_KEYS = new Set(['service', 'privacy', 'marketingPrivacy', 'adEmail', 'adPush', 'adNightPush']);

export function getSignupDocument(key) {
  return bundle.documents.find(document => document.id === key) || null;
}

export function isConsentDocument(document) {
  return !!document && CONSENT_KEYS.has(document.id) && !!document.termsType;
}

// Render link labels inline without interpreting raw HTML or Markdown in the app.
// 안드로이드 줄바꿈: 낱말 가운데에서는 끊지 않고(예전 글자마다 끊기던 '신승 / 민' · '다이 / 어리'를 고침, 2026-11-09 지라 655)
// 띄어쓰기와 가운뎃점 '·' 뒤에서만 줄을 바꾼다('·'로 이은 긴 말이 통째로 넘어가 줄 끝이 크게 비지 않게, '·'가 줄 첫머리에 오지 않게).
// 제목도 같은 규칙으로 낱말을 지킨다. iOS · 웹은 그대로(iOS hangul-word · 웹 keep-all).
// 링크가 없는 문단은 화면 읽기용 원문을 따로 준다(paragraphLabel) — 링크 문단은 링크를 링크로 읽게 원문 이름을 주지 않는다
export const justifyBreaks = (text, { os } = {}) => keepKoreanWords(text, os, { breakAfterDot: true });
// 안드로이드는 양쪽 맞춤을 띄어쓰기만 늘려서 해, 낱말 단위로 줄을 바꾸면 '개인정보처리자·운영자·개인정보 ⎵⎵ 보호책임자'처럼 빈칸이 크게 벌어진다
// (글자 사이로 늘리는 방식은 안드로이드 15 부터이고 RN 이 쓰지 않는다). 실기기에서 '정보 줄만 왼쪽'안과 비교해 안드로이드는 본문 전체 왼쪽 맞춤(2026-11-09 지라 655).
// 링크 밑줄이 늘린 만큼 밀리던 문제(2026-11-08)도 함께 없어진다. iOS · 웹은 양쪽 맞춤
export const justifiedParagraph = (block, os) => os !== 'android';
/** 안드로이드에서 링크 없는 문단 · 제목이면 화면 읽기가 원문을 읽게 할 이름(TalkBack 이 폭 없는 결합자 · 빈칸에서 끊어 읽지 않게), 아니면 undefined.
 * 링크 문단은 링크를 링크로 읽게 이름을 주지 않는다 */
export const paragraphLabel = (block, os, prefix = '') =>
  os === 'android' && !block.links?.length ? `${prefix}${block.text}` : undefined;

export function documentTextRuns(block) {
  const runs = [];
  let offset = 0;
  for (const link of block.links || []) {
    const start = block.text.indexOf(link.label, offset);
    if (start < 0) continue;
    if (start > offset) runs.push({ text: block.text.slice(offset, start) });
    runs.push({ text: link.label, url: link.url });
    offset = start + link.label.length;
  }
  if (offset < block.text.length) runs.push({ text: block.text.slice(offset) });
  return runs;
}
