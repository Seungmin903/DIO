import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { DEFAULT_PAPER_APPEARANCE, PAPER_BACKGROUNDS, normalizePaperAppearance } from '../../editor/templates/appearance.js';
import { configuredPageIds } from '../../editor/templates/creation.js';
import { normalizeOrientation, templateCanvasSize } from '../../editor/templates/catalog.js';
import { subscribeTextFonts } from '../../editor/utils/text';
import { mediaFailureMessage } from '../../editor/utils/mediaRecovery.js';
import { MODAL_ORIENTATIONS } from '../../editor/components/controls/EditorModal';
import { DIARY_DEFAULTS } from '../constants';
import { colors, shadow } from '../../shared/theme';
import CoverArt from './CoverArt';
import CoverOptions, { usePhotoTone } from './CoverOptions';
import PaperOptions, { BlankPreview, PaperStyleOptions, TemplatePreview } from './PaperOptions';
import { OptionRow, Segmented } from './FormControls';
import PdfImport, { MyCoverList, MyPaperList, PdfPageThumb } from './PdfImport';
import Workbench, { StagePill, fit } from './Workbench';
import ConfirmDialog from '../../editor/components/controls/ConfirmDialog';
import { coverSummary, newDiaryCover, normalizeCover } from '../utils/coverDesign';
import { defaultSections, savedPaperSummary, sectionTitle, sectionsTemplateConfig } from '../utils/paperChoice';
import { PdfImportError, coverBackupOf, coverForLibrary, coverWithPdfPage, pdfOrientation, pdfPageAspect, pdfPapersSummary, restoreCoverBase, splitPdfPages } from '../utils/pdfImport';
import { pickPdfPages } from '../utils/pdfPages';
import { discardPdfImport } from '../utils/pdfCleanup';
import useMyLibrary from '../hooks/useMyLibrary';
import { loadDefaultPaperStyle } from '../hooks/useDefaultPaperStyle';

const TITLE_LIMIT = 24;
const SHEET_SLIDE = 600;
// 표지는 세로 3:4, 가로 4:3
const COVER_RATIO = 3 / 4;
const SECTIONS = { basic: ['기본', 'edit'], cover: ['표지', 'book'], paper: ['속지', 'paper'], style: ['속지 색', 'roller'] };

// 표지 글꼴은 편집기 텍스트 도구와 같은 파일을 쓴다(쓰일 때 불러온다). 불러오면 표지를 다시 그린다.
function CoverFrame({ cover, name, width, height, edit }) {
  return <View style={[styles.coverFrame, { width, height }]}>
    <CoverArt cover={cover} name={name} width={width} height={height} edit={edit} shadow={shadow.card} />
  </View>;
}

/**
 * 새 다이어리 · 다이어리 수정 (2안 · 구역 카드 + 스위치 목록).
 * 왼쪽 구역 카드(이름 · 방향 · 표지 · 속지 · 속지 색)는 순서 없이 오가고, 가운데는 지금 고치는 것만 미리 보며,
 * 오른쪽은 요소 줄을 한 번에 하나만 펼친다. 수정에서는 방향을 잠그고 속지 구역이 없다.
 * sheet: 폰에서는 아래에서 올라오는 시트로 띄운다.
 */
export default function DiaryCreateModal({ diary, onSubmit, onCancel, saving = false, sheet = false, topInset = 0, bottomInset = 0,
  visible = true, blankOnly = false, locked = false, submitLabel, submitDisabled = false, footerNotice = null, messageResetKey, onLibrarySaveFailed }) {
  const editing = Boolean(diary);
  // 세로 화면은 폰이 아니어도 구역 카드를 위에, 옵션을 아래에 쌓는다
  const window = useWindowDimensions();
  const stacked = sheet || window.height > window.width;
  const formLocked = saving || locked;
  const [, redraw] = useReducer(value => value + 1, 0);
  useEffect(() => subscribeTextFonts(redraw), []);
  const [section, setSection] = useState(editing ? 'cover' : 'basic');
  const [title, setTitle] = useState(diary?.title ?? DIARY_DEFAULTS.title);
  const [orientation, setOrientation] = useState(normalizeOrientation(diary?.templateConfig?.orientation ?? diary?.pageSize ?? 'portrait'));
  const [cover, setCover] = useState(() => editing ? normalizeCover(diary) : newDiaryCover());
  const [openElement, setOpenElement] = useState('base');
  // 속지 묶음: 위에서부터 순서대로 쌓는다 (화면은 한 줄 목록 + 이어서 · 섞어서)
  const [paperSections, setPaperSections] = useState(defaultSections);
  // blankOnly: 서버 다이어리는 서버 속지 목록에 있는 속지만 만들 수 있어 빈 페이지 한 장으로 시작한다 (속지 구역 없음)
  const chosenSections = blankOnly ? [] : paperSections;
  const [paperAppearance, setPaperAppearance] = useState(() => normalizePaperAppearance(diary?.paperAppearance ?? DEFAULT_PAPER_APPEARANCE));
  const [scope, setScope] = useState('all');
  // 새 다이어리의 속지 스타일은 꾸미기 공방의 기본 속지 설정에서 시작한다. 사용자가 고르기 전에만 채우고, 만든 다이어리는 자기 설정을 따로 갖는다.
  const appearanceTouched = useRef(false);
  const changeAppearance = next => { appearanceTouched.current = true; setPaperAppearance(next); };
  const [defaultApplied, setDefaultApplied] = useState(Boolean(editing));
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [notice, setNotice] = useState('');
  // PDF 불러오기: 쪽마다 그림으로 바꾼 pdf, 첫 장을 표지로 쓸지, 내 표지 · 내 속지에 남길지
  const [pdf, setPdf] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(null);
  // PDF 를 바꾸는 동안에는 표지 · 제목 · 보관함을 잠근다: 끝난 뒤 시작 시점의 표지로 덮어쓰지 않게
  const editLocked = formLocked || pdfBusy;
  const [firstAsCover, setFirstAsCover] = useState(true);
  const [coverAlsoPaper, setCoverAlsoPaper] = useState(false);
  const [addToMyCovers, setAddToMyCovers] = useState(false);
  const [addToMyPapers, setAddToMyPapers] = useState(false);
  const [skipPdfPapers, setSkipPdfPapers] = useState(false);
  const [myPaper, setMyPaper] = useState(null);
  const [myCoverId, setMyCoverId] = useState(null);
  const coverBackup = useRef(null);
  const library = useMyLibrary();
  useEffect(() => { setError(''); }, [messageResetKey]);
  const submitting = useRef(false);
  const slide = useRef(new Animated.Value(sheet ? 1 : 0)).current;
  useEffect(() => {
    if (!sheet) return;
    Animated.timing(slide, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [sheet, slide]);

  // 수정은 저장된 첫 속지를, 새 다이어리는 고른 속지를 미리 본다.
  // 새 다이어리는 묶음 전체의 페이지 순서를 한 번 만들어 장수 · 미리보기에 같이 쓴다
  let allIds = null, configError = '';
  if (!editing) {
    try { allIds = configuredPageIds(sectionsTemplateConfig(chosenSections, orientation)); } catch (failure) { configError = failure.message; }
  }
  // PDF 속지: 내 속지를 골랐으면 그 쪽들, 아니면 불러온 PDF 에서 표지로 쓴 첫 쪽을 뺀 나머지. 서버 다이어리도 PDF 쪽은 속지로 쓴다(쪽마다 서버 페이지를 만들고 원본 PDF 를 올린다).
  const pdfSplit = splitPdfPages(pdf?.pages, firstAsCover, coverAlsoPaper);
  const pdfPapers = editing ? [] : myPaper ? myPaper.pages : pdf && !skipPdfPapers ? pdfSplit.papers : [];
  const usingPdf = pdfPapers.length > 0;
  const pdfSource = myPaper?.name ?? pdf?.name ?? '';
  const pageCount = usingPdf ? pdfPapers.length : allIds?.length ?? null;
  const firstPageId = useMemo(() => {
    if (!editing) return allIds?.[0] ?? null;
    try { return configuredPageIds(diary.templateConfig)[0] ?? null; } catch { return null; }
  }, [editing, diary, allIds?.[0]]); // eslint-disable-line react-hooks/exhaustive-deps
  const filledSections = paperSections.filter(item => item.rows.length);
  const summaries = {
    basic: `${orientation === 'landscape' ? '가로' : '세로'} · ${title.trim() || '이름 없음'}`,
    cover: coverSummary(cover),
    paper: usingPdf ? pdfPapersSummary(pdfPapers.length) : filledSections.length ? `${sectionTitle(filledSections[0])}${filledSections.length > 1 ? ` 외 ${filledSections.length - 1}` : ''}` : '없음',
    style: PAPER_BACKGROUNDS.find(([, color]) => color === paperAppearance.backgroundColor)?.[0] ?? paperAppearance.backgroundColor,
  };
  const sections = (editing || blankOnly ? ['basic', 'cover', 'style'] : ['basic', 'cover', 'paper', 'style'])
    .map(id => ({ id, title: SECTIONS[id][0], icon: SECTIONS[id][1], summary: summaries[id] }));
  // 처음 연 상태와 다르면 '바꿈'. 수정은 바꾼 게 있을 때만 저장할 수 있고, 바꾼 채로 취소하면 한 번 묻는다.
  // 사진 대표 색(photo.tone)은 열 때 뽑아 채우는 값이라 고친 것으로 치지 않는다
  const snapshot = JSON.stringify({ title, orientation, cover: cover.photo?.tone ? { ...cover, photo: { ...cover.photo, tone: null } } : cover, paperSections, paperAppearance, scope,
    pdf: pdf?.pages.length ?? 0, myPaper: myPaper?.id ?? null });
  const initial = useRef(snapshot);
  const dirty = snapshot !== initial.current;
  useEffect(() => {
    if (editing) return undefined;
    let live = true;
    loadDefaultPaperStyle().then(style => { if (live && !appearanceTouched.current) setPaperAppearance(style); }).finally(() => { if (live) setDefaultApplied(true); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 기본값을 채운 것은 사용자가 바꾼 것이 아니다: 채운 뒤의 모습을 '처음 상태'로 다시 잡는다
  useEffect(() => { if (!editing && defaultApplied) initial.current = snapshot; }, [defaultApplied]); // eslint-disable-line react-hooks/exhaustive-deps
  const cancel = () => { if (saving) return; if (dirty) setLeaving(true); else onCancel(); };
  const actionLabel = saving ? '저장 중…' : submitLabel || (editing ? '저장' : '만들기');
  const disabled = saving || submitDisabled || Boolean(configError) || editing && !dirty;

  const changeTitle = value => { setTitle(value); setError(''); };
  const changeCover = next => { setCover(next); setError(''); };
  usePhotoTone(cover, setCover);

  // ---------- PDF 불러오기 · 내 표지 · 내 속지 ----------
  // 불러온 쪽은 이 화면이 저장 없이 닫히면 미디어 보관함에서 지운다 (내 속지에서 가져온 쪽은 지우지 않는다)
  const submitted = useRef(false);
  const unsaved = useRef(null);
  unsaved.current = pdf ?? null;
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; if (!submitted.current && unsaved.current) discardPdfImport(unsaved.current).catch(() => {}); }, []);

  // 첫 쪽을 표지 바탕으로 쓰고 끈다. 끄면 쓰기 전의 바탕으로 되돌린다.
  const applyPdfCover = (on, page, base = cover) => {
    if (on && page) {
      coverBackup.current ??= coverBackupOf(base);
      setCover(coverWithPdfPage(base, page)); setMyCoverId(null);
    } else if (coverBackup.current) {
      setCover(restoreCoverBase(base, coverBackup.current)); coverBackup.current = null;
    }
  };
  const dropPdf = () => {
    applyPdfCover(false);
    if (pdf) discardPdfImport(pdf).catch(() => {});
    setPdf(null); setSkipPdfPapers(false); setAddToMyPapers(false);
  };
  const pickPdf = async () => {
    if (pdfBusy || formLocked) return;
    setPdfBusy(true); setPdfProgress(null); setNotice(''); setError('');
    try {
      const result = await pickPdfPages({ onProgress: (done, total) => setPdfProgress({ done, total }) });
      if (!result?.pages.length) return;
      // 바꾸는 동안 화면이 닫혔으면 아무 데도 쓰이지 않으니 바로 지운다
      if (!mounted.current) { discardPdfImport(result).catch(() => {}); return; }
      const previous = pdf;
      // 새 PDF 의 첫 쪽으로 표지를 다시 만들 수 있게 이전 PDF 표지를 먼저 되돌린다
      const base = coverBackup.current ? restoreCoverBase(cover, coverBackup.current) : cover;
      coverBackup.current = null;
      setPdf(result); setMyPaper(null); setSkipPdfPapers(false); setOrientation(pdfOrientation(result.pages[0].aspect));
      if (firstAsCover) applyPdfCover(true, result.pages[0], base); else setCover(base);
      if (previous) discardPdfImport(previous).catch(() => {});
    } catch (failure) {
      if (!mounted.current) return;
      setNotice(failure instanceof PdfImportError ? failure.message : mediaFailureMessage(failure));
    } finally { setPdfBusy(false); setPdfProgress(null); }
  };
  const changeFirstAsCover = on => {
    setFirstAsCover(on);
    if (pdf) applyPdfCover(on, pdf.pages[0]);
    if (!on) setSkipPdfPapers(false);
  };
  const useMyCover = item => { coverBackup.current = null; setCover(item.cover); setMyCoverId(item.id); setError(''); };
  const useMyPaper = item => { setMyPaper(item); setOrientation(item.orientation); setError(''); };
  const removeMyCover = item => { library.removeCover(item.id); if (myCoverId === item.id) setMyCoverId(null); };
  const removeMyPaper = item => { library.removePaper(item.id); if (myPaper?.id === item.id) setMyPaper(null); };

  const onSave = async () => {
    if (disabled || submitting.current) return;
    const trimmed = title.trim();
    if (!trimmed) { setSection('basic'); setError('다이어리 이름을 입력해 주세요.'); return; }
    let templateConfig;
    if (!editing) {
      try { templateConfig = sectionsTemplateConfig(chosenSections, orientation); } catch (failure) { setError(failure.message); return; }
    }
    submitting.current = true;
    // 저장이 끝나기 전에 화면이 닫혀도 불러온 PDF 쪽을 지우지 않게 먼저 표시하고, 실패하면 되돌린다.
    submitted.current = true;
    try {
      const failure = await onSubmit({ title: trimmed, color: cover.color, pattern: cover.pattern.type === 'none' ? null : cover.pattern.type, cover,
        pageSize: orientation, templateConfig, paperAppearance, appearanceScope: editing ? scope : 'all', importedPages: usingPdf ? pdfPapers : undefined });
      if (failure) { submitted.current = false; setError(failure); }
      else if (!editing) {
        // 만든 뒤에 보관함에 남긴다. 보관함 저장이 실패해도 다이어리는 이미 만들어졌으니, 창이 닫힌 뒤 알약으로 알리고 다시 시도하게 넘긴다.
        const entries = {
          ...(pdf && addToMyCovers && { cover: { name: pdf.name, orientation, cover: coverForLibrary(cover) } }),
          ...(usingPdf && addToMyPapers && !myPaper && { paper: { name: pdf.name, orientation, pages: pdfPapers } }),
        };
        const saveToLibrary = async kinds => {
          const left = [];
          for (const kind of kinds) {
            const ok = await (kind === 'cover' ? library.addCover(entries.cover) : library.addPaper(entries.paper)).catch(() => false);
            if (!ok) left.push(kind);
          }
          return left;
        };
        const left = await saveToLibrary(Object.keys(entries));
        if (left.length) onLibrarySaveFailed?.({ kinds: left, retry: saveToLibrary });
      }
    } catch {
      submitted.current = false;
      setError('다이어리를 저장하지 못했어요. 다시 시도해 주세요.');
    } finally { submitting.current = false; }
  };

  // ---------- 가운데 미리보기: 지금 고치는 것만 ----------
  const paperRatio = (() => { const { width, height } = templateCanvasSize(orientation); return width / height; })();
  const coverRatio = orientation === 'landscape' ? 1 / COVER_RATIO : COVER_RATIO;
  const pdfRatio = pdfPageAspect(pdfPapers[0], paperRatio);
  let preview = null;
  if (stage.width > 0) {
    const maxHeight = stage.height - (stacked ? 44 : 80);
    const wide = stage.width * (stacked ? 0.86 : 0.8);
    if (section === 'basic') {
      const gap = stacked ? 16 : 32; // 표지 · 속지 높이는 최대 352(264×352 · 200×352), 둘은 같은 기준선(코덱스 8번)
      const half = (stage.width - (stacked ? 32 : 80) - gap) / 2;
      const coverSize = fit(coverRatio, half, Math.min(maxHeight, 352));
      const paperSize = fit(usingPdf ? pdfRatio : paperRatio, half, Math.min(maxHeight, 352));
      preview = <>
        <View style={[styles.pair, { gap }]}>
          <CoverFrame cover={cover} name={title} width={coverSize.width} height={coverSize.height} />
          {usingPdf ? <PdfPageThumb page={pdfPapers[0]} width={paperSize.width} ratio={pdfRatio} style={styles.paperShadow} />
            : firstPageId ? <TemplatePreview assetId={firstPageId} width={paperSize.width} appearance={paperAppearance} style={styles.paperShadow} />
            : <BlankPreview orientation={orientation} width={paperSize.width} appearance={paperAppearance} style={styles.paperShadow} />}
        </View>
      </>;
    } else if (section === 'cover') {
      const size = fit(coverRatio, wide, maxHeight);
      preview = <>
        <CoverFrame cover={cover} name={title} width={size.width} height={size.height}
          edit={editLocked ? null : { onChange: changeCover, onSelectSticker: id => { if (id && id !== 'title') setOpenElement('stickers'); } }} />
      </>;
    } else if (section === 'paper' && usingPdf) {
      const stripCount = Math.min(pdfPapers.length, stacked ? 6 : 8);
      const stripWidth = Math.min(stacked ? 34 : 46, (wide - (stripCount - 1) * 6) / Math.max(1, stripCount));
      const stripHeight = stacked ? 48 : 64;
      const size = fit(pdfRatio, wide, maxHeight - (stripCount > 1 ? stripHeight + (stacked ? 12 : 20) : 0));
      preview = <>
        <PdfPageThumb page={pdfPapers[0]} width={size.width} ratio={pdfRatio} style={styles.paperShadow} />
        {stripCount > 1 && <View style={styles.strip}>
          {pdfPapers.slice(0, stripCount).map((page, index) => <PdfPageThumb key={`${page.mediaFileId}-${index}`} page={page} width={stripWidth} maxHeight={stripHeight} />)}
          {pdfPapers.length > stripCount && <Text style={styles.stripMore}>…</Text>}
        </View>}
        <StagePill>전체 {pdfPapers.length}페이지</StagePill>
      </>;
    } else if (section === 'paper' && allIds && !allIds.length) {
      // 속지 묶음이 없으면 빈 페이지 한 장으로 시작한다
      const size = fit(paperRatio, wide, maxHeight);
      preview = <>
        <BlankPreview orientation={orientation} width={size.width} appearance={paperAppearance} style={styles.paperShadow} />
        <StagePill>속지 없음 · 빈 페이지 1장</StagePill>
      </>;
    } else if (section === 'paper' && allIds) {
      // 첫 장을 크게, 그 아래에 처음 몇 장을 순서대로 작게 보여 섞인 차례를 확인한다
      const ids = allIds;
      const stripCount = Math.min(ids.length, stacked ? 6 : 8);
      const stripWidth = Math.min(stacked ? 34 : 46, (wide - (stripCount - 1) * 6) / Math.max(1, stripCount));
      const stripHeight = stripWidth / paperRatio;
      const size = fit(paperRatio, wide, maxHeight - stripHeight - (stacked ? 12 : 20));
      preview = <>
        <TemplatePreview assetId={ids[0]} width={size.width} appearance={paperAppearance} style={styles.paperShadow} />
        {stripCount > 1 && <View style={styles.strip}>
          {ids.slice(0, stripCount).map((id, index) => <TemplatePreview key={`${id}-${index}`} assetId={id} width={stripWidth} appearance={paperAppearance} sketch />)}
          {ids.length > stripCount && <Text style={styles.stripMore}>…</Text>}
        </View>}
        <StagePill>전체 {pageCount}페이지</StagePill>
      </>;
    } else if (firstPageId) {
      const size = fit(paperRatio, wide, maxHeight);
      preview = <>
        <TemplatePreview assetId={firstPageId} width={size.width} appearance={paperAppearance} style={styles.paperShadow} />
        <StagePill>{editing ? savedPaperSummary(diary.templateConfig) : `전체 ${pageCount ?? '—'}페이지`}</StagePill>
      </>;
    } else {
      // 속지를 고르지 않았으면 고른 색을 빈 페이지로 보여 준다(속지 색 탭의 판이 비지 않게)
      const size = fit(paperRatio, wide, maxHeight);
      preview = <BlankPreview orientation={orientation} width={size.width} appearance={paperAppearance} style={styles.paperShadow} />;
    }
  }

  // ---------- 오른쪽: 구역별 옵션 ----------
  let panel;
  if (section === 'basic') panel = <View>
    <OptionRow label="이름">
      <TextInput accessibilityLabel="다이어리 이름" editable={!editLocked} value={title} onChangeText={changeTitle} placeholder="예: 2026 봄의 기록" placeholderTextColor={colors.textMuted}
        maxLength={TITLE_LIMIT} selectTextOnFocus style={[styles.input, error && !title.trim() && styles.inputError]} />
      <Text style={styles.count}>{title.length}/{TITLE_LIMIT}</Text>
    </OptionRow>
    <OptionRow label="방향">
      <Segmented disabled={editing} items={[{ id: 'portrait', label: '세로' }, { id: 'landscape', label: '가로' }]} selected={id => id === orientation} onPress={setOrientation} />
    </OptionRow>
    {!editing && <PdfImport pdf={pdf} busy={pdfBusy} progress={pdfProgress} disabled={formLocked} onPick={pickPdf} onClear={dropPdf}
      firstAsCover={firstAsCover} onFirstAsCover={changeFirstAsCover} addToMyCovers={addToMyCovers} onAddToMyCovers={setAddToMyCovers}
      addToMyPapers={addToMyPapers} onAddToMyPapers={setAddToMyPapers} coverAlsoPaper={coverAlsoPaper} onCoverAlsoPaper={setCoverAlsoPaper} />}
    {editing && <View style={styles.infoCard}>
      <Text style={styles.infoTitle}>{savedPaperSummary(diary.templateConfig)}</Text>
    </View>}
  </View>;
  else if (section === 'cover') panel = <View style={styles.coverPanel}>
    {!editing && <MyCoverList items={library.covers} name={title} selectedId={myCoverId} onPick={useMyCover} onRemove={removeMyCover} disabled={editLocked} />}
    <CoverOptions cover={cover} name={title} ratio={coverRatio} onChange={changeCover} openElement={openElement} onOpenElement={setOpenElement} onNotice={setNotice} />
  </View>;
  else if (section === 'paper') panel = <View style={styles.coverPanel}>
    <MyPaperList items={library.papers} selectedId={myPaper?.id} onPick={useMyPaper} onRemove={removeMyPaper} disabled={editLocked} />
    {usingPdf ? <View style={styles.infoCard}>
      <Text style={styles.infoTitle}>{`${pdfSource} · ${pdfPapers.length}장`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="PDF 속지 빼기" disabled={editLocked} onPress={() => { if (myPaper) setMyPaper(null); else setSkipPdfPapers(true); }}
        style={({ pressed }) => [styles.drop]}><Text style={styles.dropText}>속지에서 빼기</Text></Pressable>
    </View> : <PaperOptions sections={paperSections} onChange={next => { setPaperSections(next); setError(''); }} orientation={orientation} appearance={paperAppearance} />}
  </View>;
  else panel = <PaperStyleOptions appearance={paperAppearance} onChange={changeAppearance} plainOnly={!editing && (blankOnly || usingPdf || paperSections.every(item => item.rows.every(row => row.paper === 'plain')))}
    scope={scope} onScope={editing ? setScope : null} />;

  const message = error || configError || notice;
  const foot = (message || footerNotice) ? <>
    {message ? <Text accessibilityRole="alert" style={error || configError ? styles.error : styles.notice}>{message}</Text> : null}
    {footerNotice}
  </> : null;

  return (
    // Android Modal은 앱과 다른 창이라 앱에서 숨긴 상태 바가 다시 나타나고, 그 높이만큼 창 전체가 아래로 밀렸다.
    // 상태 바·내비게이션 바 위까지 그리게 하고 상태 바는 계속 숨긴다. 아래 시스템 바 높이만큼은 여백으로 비운다.
    // iOS Modal 기본값은 세로 전용이라 가로로 고정한 태블릿에서 열면 앱이 종료된다. 두 방향을 모두 허용한다.
    <Modal visible={visible} transparent supportedOrientations={MODAL_ORIENTATIONS} presentationStyle="overFullScreen"
      statusBarTranslucent navigationBarTranslucent onRequestClose={cancel}>
      <StatusBar hidden />
      <View accessibilityViewIsModal style={styles.overlay}>
        <Animated.View style={[styles.dialog, !stacked && { paddingBottom: bottomInset }, sheet && { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, SHEET_SLIDE] }) }] }]}>
          <Workbench title={editing ? '다이어리 수정' : '새 다이어리'} actionLabel={actionLabel} onCancel={cancel} cancelDisabled={saving} onSubmit={onSave} submitDisabled={disabled}
            sections={sections} section={section} onSection={id => { setSection(id); setNotice(''); }} sheet={stacked} roomy={!sheet} topInset={topInset} bottomInset={bottomInset}
            onStageLayout={setStage} stage={preview} panel={panel} panelLocked={editLocked} foot={foot} />
        </Animated.View>
        <ConfirmDialog open={leaving} title="저장하지 않고 닫을까요?" message="바꾼 내용은 저장되지 않아요." confirmLabel="닫기"
          onConfirm={() => { setLeaving(false); onCancel(); }} onCancel={() => setLeaving(false)} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // 화면 전체를 쓴다 (폰은 아래에서 올라오며 열린다)
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20 },
  dialog: { flex: 1, overflow: 'hidden', backgroundColor: colors.surfaceSoft },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stripMore: { color: colors.textMuted, fontSize: 16, fontWeight: '800' },
  pair: { flexDirection: 'row', alignItems: 'center' },
  coverFrame: { borderTopLeftRadius: 6, borderBottomLeftRadius: 6, borderTopRightRadius: 14, borderBottomRightRadius: 14 },
  paperShadow: { ...shadow.card, shadowOpacity: 0.06 },
  input: { height: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 14, fontWeight: '700', backgroundColor: colors.surfaceSoft },
  inputError: { borderColor: colors.danger },
  count: { alignSelf: 'flex-end', color: colors.textMuted, fontSize: 11 },
  infoCard: { marginTop: 8, padding: 12, gap: 4, borderRadius: 12, backgroundColor: colors.surfaceSoft },
  coverPanel: { gap: 4 },
  drop: { alignSelf: 'flex-start', height: 36, paddingHorizontal: 14, marginTop: 4, borderRadius: 999, justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  dropText: { color: colors.text, fontSize: 12.5, fontWeight: '700' },
  infoTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 12.5, fontWeight: '700' },
  notice: { color: colors.textMuted, fontSize: 12.5, fontWeight: '700' },
});
