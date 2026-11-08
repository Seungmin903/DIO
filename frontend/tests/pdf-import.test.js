import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { coverBackupOf, coverForLibrary, coverWithPdfPage, pdfDocPage, pdfOrientation, restoreCoverBase, splitPdfPages, withPdfPages } from '../src/diary/utils/pdfImport.js';
import { addMyCover, addMyPaper, MY_LIBRARY_LIMIT, normalizeMyCovers, normalizeMyPapers, removeEntry, renameEntry } from '../src/diary/utils/myLibrary.js';
import { defaultCover } from '../src/diary/utils/coverDesign.js';
import { createDefaultDoc } from '../src/editor/state/defaultDoc.js';

const page = (n, aspect = 0.75) => ({ src: `media:m${n}`, mediaFileId: `m${n}`, aspect, name: `문서 ${n}쪽` });
const pages = [page(1), page(2), page(3)];

test('PDF 첫 쪽 비율로 방향을 정한다', () => {
  assert.equal(pdfOrientation(0.707), 'portrait');
  assert.equal(pdfOrientation(1.4), 'landscape');
  assert.equal(pdfOrientation(1), 'landscape');
});

test('첫 장을 표지로 쓰면 첫 쪽은 표지, 나머지가 속지다', () => {
  const on = splitPdfPages(pages, true);
  assert.equal(on.cover, pages[0]); assert.deepEqual(on.papers, pages.slice(1));
  const off = splitPdfPages(pages, false);
  assert.equal(off.cover, null); assert.equal(off.papers.length, 3);
  assert.deepEqual(splitPdfPages([page(1)], true).papers, []);
  // 표지로 쓴 첫 쪽을 속지 1쪽으로도 넣기
  const both = splitPdfPages(pages, true, true);
  assert.equal(both.cover, pages[0]); assert.deepEqual(both.papers, pages);
  assert.deepEqual(splitPdfPages([page(1)], true, true).papers, [page(1)]);
  assert.deepEqual(splitPdfPages(pages, false, true).papers, pages, '첫 장을 표지로 안 쓰면 이 값은 상관없다');
  assert.deepEqual(splitPdfPages([], true), { cover: null, papers: [] });
});

test('표지 바탕을 PDF 쪽으로 바꾸면 표지 꾸밈을 모두 빼고, 끄면 원래 바탕과 꾸밈으로 돌아간다', () => {
  const base = { ...defaultCover(), enabled: false };
  assert.equal(base.band.on, true); assert.notEqual(base.plate, 'none');
  const covered = coverWithPdfPage(base, pages[0]);
  assert.equal(covered.kind, 'photo'); assert.equal(covered.enabled, true);
  assert.deepEqual(covered.photo, { src: 'media:m1', mediaFileId: 'm1', aspect: 0.75 });
  // PDF 쪽이 곧 표지라서 고무줄 · 라벨 · 제목 · 소제목 · 스티커는 기본으로 빠진다
  assert.equal(covered.band.on, false); assert.equal(covered.plate, 'none');
  assert.equal(covered.title.useName, false); assert.equal(covered.title.text, ''); assert.equal(covered.subtitle.on, false); assert.deepEqual(covered.stickers, []);
  assert.equal(base.band.on, true, '원본 표지는 바뀌지 않는다');
  // keepDecor: 꾸밈을 그대로 둔다
  const kept = coverWithPdfPage(base, pages[0], { keepDecor: true });
  assert.deepEqual(kept.band, base.band); assert.deepEqual(kept.title, base.title);
  // 끄면 PDF 로 바꾸기 전의 바탕 · 꾸밈으로
  const restored = restoreCoverBase(covered, coverBackupOf(base));
  assert.equal(restored.kind, 'plain'); assert.equal(restored.enabled, false); assert.equal(restored.photo, null);
  assert.deepEqual(restored.band, base.band); assert.equal(restored.plate, base.plate); assert.deepEqual(restored.title, base.title);
  // 그 사이에 사용자가 꾸민 것(제목 글자)이 있으면 지우지 않는다
  const edited = { ...covered, title: { ...covered.title, text: '내 표지' } };
  assert.equal(restoreCoverBase(edited, coverBackupOf(base)).title.text, '내 표지');
  // 이전 형식 백업(꾸밈 없음)도 바탕만 되돌린다
  assert.equal(restoreCoverBase(covered, { kind: base.kind, enabled: base.enabled, photo: base.photo }).band.on, false);
  // 원래 사진 표지가 아니었는데 사진이 비어 있으면 색 표지로 돌린다
  assert.equal(restoreCoverBase(covered, { kind: 'photo', enabled: true, photo: null }).kind, 'plain');
});

test('내 표지에 담을 때는 PDF 그림만 남기고 고무줄 · 라벨 · 제목 · 소제목 · 스티커를 뺀다', () => {
  const covered = coverWithPdfPage(defaultCover(), pages[0], { keepDecor: true });
  assert.equal(covered.band.on, true); assert.notEqual(covered.plate, 'none');
  const saved = coverForLibrary(covered);
  assert.equal(saved.band.on, false); assert.equal(saved.plate, 'none');
  assert.deepEqual(saved.photo, covered.photo);
  assert.equal(saved.title.useName, false); assert.equal(saved.title.text, ''); assert.equal(saved.subtitle.on, false); assert.deepEqual(saved.stickers, []);
  assert.equal(covered.band.on, true); assert.equal(covered.title.useName, true, '원본 표지는 바뀌지 않는다');
  const [entry] = normalizeMyCovers(addMyCover([], { name: 'a', orientation: 'portrait', cover: saved }));
  assert.equal(entry.cover.band.on, false); assert.equal(entry.cover.plate, 'none');
  assert.equal(entry.cover.title.useName, false); assert.equal(entry.cover.subtitle.on, false);
});

test('PDF 쪽은 비율을 지키며 페이지 안에 잠근 그림 하나로 깔린다', () => {
  const tall = pdfDocPage(page(1, 0.5), 'landscape', {});
  const [image] = tall.objects;
  assert.equal(image.locked, true); assert.equal(image.mediaFileId, 'm1'); assert.equal(image.type, 'sticker');
  assert.ok(image.x >= 0 && image.y >= 0 && image.x + image.w <= tall.canvasWidth + 1e-6 && image.y + image.h <= tall.canvasHeight + 1e-6);
  assert.ok(Math.abs(image.w / image.h - 0.5) < 1e-6);
  const same = pdfDocPage(page(1, 1024 / 768), 'landscape', {}).objects[0];
  assert.deepEqual([same.x, same.y, Math.round(same.w), Math.round(same.h)], [0, 0, 1024, 768]);
});

test('문서의 페이지를 PDF 쪽으로 바꾸고, 쪽이 없으면 그대로 둔다', () => {
  const doc = createDefaultDoc({ title: '시험', pageSize: 'portrait' });
  assert.equal(withPdfPages(doc, [], 'portrait', {}), doc);
  assert.equal(withPdfPages(doc, undefined, 'portrait', {}), doc);
  const next = withPdfPages(doc, pages, 'portrait', {});
  assert.equal(next.pages.length, 3); assert.equal(next.title, '시험');
  assert.deepEqual(next.pages.map(item => item.objects[0].mediaFileId), ['m1', 'm2', 'm3']);
  assert.equal(new Set(next.pages.map(item => item.id)).size, 3);
  assert.equal(next.pages[0].canvasWidth, 768);
});

test('내 표지 · 내 속지는 저장 값을 맞추고 잘못된 항목을 버린다', () => {
  const covers = normalizeMyCovers([{ id: 'a', name: '  봄  ', cover: defaultCover() }, { id: 'a', cover: defaultCover() }, { id: 'b' }, null, 'x']);
  assert.deepEqual(covers.map(item => [item.id, item.name]), [['a', '봄']]);
  assert.equal(normalizeMyCovers('bad').length, 0);
  const papers = normalizeMyPapers([{ id: 'p', name: '플래너', orientation: 'portrait', pages: [...pages, { src: 'x' }] }, { id: 'empty', pages: [] }, { id: 'p', pages }]);
  assert.equal(papers.length, 1); assert.equal(papers[0].pages.length, 3); assert.equal(papers[0].orientation, 'portrait');
  assert.equal(normalizeMyPapers(null).length, 0);
});

test('나의 보관함은 새 항목을 맨 앞에 두고 한도를 넘으면 오래된 것을 뺀다', () => {
  let list = [];
  for (let i = 0; i < MY_LIBRARY_LIMIT + 3; i += 1) list = addMyCover(list, { name: `표지 ${i}`, cover: defaultCover() });
  assert.equal(list.length, MY_LIBRARY_LIMIT); assert.equal(list[0].name, `표지 ${MY_LIBRARY_LIMIT + 2}`);
  const papers = addMyPaper([], { name: '', orientation: 'portrait', pages });
  assert.equal(papers[0].name, '내 속지'); assert.equal(papers[0].pages.length, 3);
  assert.deepEqual(removeEntry(list, list[0].id).length, MY_LIBRARY_LIMIT - 1);
});

test('내 표지는 방향을 저장하고, 방향 없이 담긴 옛 표지는 사진 비율로 짐작한다', () => {
  const cover = { ...defaultCover(), kind: 'photo', photo: { src: 'media:m1', mediaFileId: 'm1', aspect: 1.29 } };
  assert.equal(addMyCover([], { name: '가로', orientation: 'landscape', cover })[0].orientation, 'landscape');
  const [old] = normalizeMyCovers([{ id: 'a', name: '옛 표지', cover }]);
  assert.equal(old.orientation, 'landscape');
  const [plain] = normalizeMyCovers([{ id: 'b', name: '기본', cover: defaultCover() }]);
  assert.equal(plain.orientation, 'portrait');
});

// 기기 쪽 흐름(pdfPages.native.js)을 가짜 네이티브 모듈로 돌린다. 정의되지 않은 함수를 부르면 여기서 깨진다.
const loadNativePages = (native, store = { saved: [], removed: [] }) => {
  const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json')), babel = expo('@babel/core');
  const code = babel.transformSync(readFileSync(new URL('../src/diary/utils/pdfPages.native.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  class PdfImportError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const mocks = {
    'expo-document-picker': { getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///a.pdf', name: '문서.pdf' }] }) },
    'expo-modules-core': { requireOptionalNativeModule: () => native },
    'expo-file-system': { File: class { delete() {} } },
    './pdfPageRaster.native.js': { renderPdfPageBitmap: async (...args) => ({ ...await native.renderPage(...args), fitted: true }) },
    '../../editor/services/mediaStore': { importMedia: async ([asset]) => [{ src: `media:${asset.fileName}`, mediaFileId: asset.fileName }], discardGeneratedMedia: async () => {} },
    '../../editor/utils/mediaPolicy.js': { MediaError: class extends Error {} },
    './pdfImport.js': { PDF_PAGE_LIMIT: 60, PDF_RENDER_EDGE: 3000, PdfImportError },
    '../../editor/utils/common.js': { createId: () => 'source-1' },
    './pdfImportRegistry': { registerPdfImport: async group => { store.registered = group; } },
    './pdfSourceStore.native.js': { savePdfSource: async (id, uri) => { store.saved.push([id, uri]); }, removePdfSource: async id => { store.removed.push(id); } },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? require(id), mod, mod.exports);
  return mod.exports;
};

test('기기에서 PDF 쪽마다 그림으로 바꾸고, 메모리가 모자라면 절반 크기로 한 번 더 그린다', async () => {
  const edges = [];
  const native = {
    pageCount: async () => 2,
    renderPage: async (uri, index, edge) => {
      edges.push([index, edge]);
      if (index === 1 && edge === 3000) throw new Error('OUT_OF_MEMORY');
      return { uri: `file:///p${index}.png`, width: edge * 0.75, height: edge };
    },
    cleanup: async () => {},
  };
  const store = { saved: [], removed: [] };
  const result = await loadNativePages(native, store).pickPdfPages();
  assert.equal(result.pages.length, 2);
  assert.deepEqual(edges, [[0, 3000], [1, 3000], [1, 1500]]);
  assert.equal(result.pages[1].name, '문서 2쪽');
  // 원본 PDF 를 보관하고, 쪽마다 원본 위치와 기본 그림의 긴 변(메모리 부족으로 줄인 쪽은 1500)을 남긴다
  assert.deepEqual(store.saved, [['source-1', 'file:///a.pdf']]);
  assert.equal(result.sourceId, 'source-1');
  assert.deepEqual(result.pages.map(page => page.pdfSource), [
    { sourceId: 'source-1', pageIndex: 0, edge: 3000, renderVersion: 2 },
    { sourceId: 'source-1', pageIndex: 1, edge: 1500, renderVersion: 2 },
  ]);
  assert.deepEqual(store.removed, []);
  assert.deepEqual(store.registered, { sourceId: 'source-1', mediaFileIds: ['문서-1.png', '문서-2.png'] });
});

test('기기에서 PDF 를 그리다 실패하면 보관한 원본도 지운다', async () => {
  const store = { saved: [], removed: [] };
  const native = { pageCount: async () => 1, renderPage: async () => { throw new Error('INVALID_FILE'); }, cleanup: async () => {} };
  await assert.rejects(() => loadNativePages(native, store).pickPdfPages());
  assert.deepEqual(store.removed, ['source-1']);
});

test('내 표지 · 속지 이름은 고칠 수 있고, 비우면 원래 이름을 둔다', () => {
  const list = addMyCover(addMyCover([], { name: 'a', orientation: 'portrait', cover: defaultCover() }), { name: 'b', orientation: 'portrait', cover: defaultCover() });
  const [first, second] = list;
  const renamed = renameEntry(list, second.id, '  여행 일기  ');
  assert.equal(renamed.find(item => item.id === second.id).name, '여행 일기');
  assert.equal(renamed.find(item => item.id === first.id).name, first.name);
  assert.equal(renameEntry(list, second.id, '   ').find(item => item.id === second.id).name, second.name);
  assert.equal(second.name, 'a', '원본 목록은 바뀌지 않는다');
});

test('iOS 구형 PDF 렌더러에는 실제 쪽 크기 이하를 요청하고 새 렌더러에는 원래 해상도를 요청한다', async () => {
  const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json')), babel = expo('@babel/core');
  const code = babel.transformSync(readFileSync(new URL('../src/diary/utils/pdfPageRaster.native.js', import.meta.url), 'utf8'), {
    configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code;
  for (const supportsScaling of [false, true]) {
    const requests = [], native = {
      ...(supportsScaling ? { supportsScaledRendering: () => true } : {}),
      renderPage: async (_uri, _index, edge) => { requests.push(edge); return { width: 595, height: edge }; },
      renderRegion() {},
    };
    const mocks = {
      'react-native': { Platform: { OS: 'ios' } },
      'expo-file-system': { File: class { async bytes() { return new Uint8Array(); } } },
      'expo-modules-core': { requireOptionalNativeModule: () => native },
      'pdf-lib/dist/pdf-lib.js': { PDFDocument: { load: async () => ({ getPage: () => ({ getCropBox: () => ({ width: 595.32, height: 841.92 }) }) }) } },
      './pdfSourceStore.native.js': {},
      './pdfSource.js': {},
    };
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', code)(id => mocks[id], mod, mod.exports);
    const result = await mod.exports.renderPdfPageBitmap('file:///a.pdf', 0, 3000);
    assert.deepEqual(requests, [supportsScaling ? 3000 : 840]);
    assert.equal(result.fitted, true);
    assert.equal(mod.exports.canRenderPdfDetail(), supportsScaling);
  }
});
