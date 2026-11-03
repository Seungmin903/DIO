import bundle from './legalContent.json' with { type: 'json' };

const CONSENT_KEYS = new Set(['service', 'privacy', 'marketingPrivacy', 'adEmail', 'adPush', 'adNightPush']);

export function getSignupDocument(key) {
  return bundle.documents.find(document => document.id === key) || null;
}

export function isConsentDocument(document) {
  return !!document && CONSENT_KEYS.has(document.id) && !!document.termsType;
}

// Render link labels inline without interpreting raw HTML or Markdown in the app.
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
