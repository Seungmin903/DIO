import bundle from './legalContent.json' with { type: 'json' };

const CONSENT_KEYS = new Set(['service', 'privacy', 'marketingPrivacy', 'adEmail', 'adPush', 'adNightPush']);

export function getSignupDocument(key) {
  return bundle.documents.find(document => document.id === key) || null;
}

export function isConsentDocument(document) {
  return !!document && CONSENT_KEYS.has(document.id) && !!document.termsType;
}

// Render link labels inline without interpreting raw HTML or Markdown in the app.
// 안드로이드 양쪽 맞춤은 띄어쓰기만 늘린다. 줄이 낱말 단위로만 바뀌면 '·'로 이어진 긴 낱말이 있는 줄에 큰 틈이 생겨,
// 한국어 책처럼 한글 글자 사이에도 줄을 바꿀 수 있게(폭 없는 빈칸 U+200B) 해 줄 끝 남는 폭을 한 글자 안으로 줄인다. 제목 · iOS · 웹은 그대로
const BREAKABLE = /([가-힣·])(?=[가-힣·])/g;
// 줄바꿈 자리는 제목만 빼고 넣는다(skip). 링크가 있는 문단도 넣어야 왼쪽 맞춤에서 줄 끝이 맞는다(빼면 메일 주소 · 긴 낱말에서 줄이 크게 비었다).
// 링크가 없는 문단은 화면 읽기용 원문을 따로 준다(paragraphLabel) — 링크 문단은 링크를 링크로 읽게 원문 이름을 주지 않는다
export const justifyBreaks = (text, { os, skip = false } = {}) =>
  os === 'android' && !skip && typeof text === 'string' ? text.replace(BREAKABLE, '$1\u200B') : text;
// 안드로이드는 양쪽 맞춤으로 빈칸을 늘리기 전 자리에 밑줄을 그려, 링크 밑줄이 늘린 만큼 왼쪽으로 밀린다(실기기 2026-11-08).
// 링크가 있는 문단만 안드로이드에서 왼쪽 맞춤 — 글자 사이 줄바꿈이 있어 줄 끝은 거의 맞는다
export const justifiedParagraph = (block, os) => !(os === 'android' && block.links?.length);
/** 안드로이드에서 링크 없는 본문 문단이면 화면 읽기가 원문을 읽게 할 이름(TalkBack 이 폭 없는 빈칸에서 끊어 읽지 않게), 아니면 undefined */
export const paragraphLabel = (block, os, prefix = '') =>
  os === 'android' && block.type !== 'heading' && justifiedParagraph(block, os) ? `${prefix}${block.text}` : undefined;

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
