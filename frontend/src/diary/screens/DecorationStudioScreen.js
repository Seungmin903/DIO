import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Header from '../components/Header';
import StudioPaperStyle from '../components/StudioPaperStyle';
import useDefaultPaperStyle from '../hooks/useDefaultPaperStyle';
import StudioPresets, { GroupHead } from '../components/StudioPresets';
import StudioSection from '../components/StudioSection';
import StudioShelf from '../components/StudioShelf';
import { PdfPageThumb } from '../components/PdfImport';
import StudioTabs from '../components/StudioTabs';
import StudioTool from '../components/StudioTool';
import EmptyState from '../components/EmptyState';
import useMyLibrary from '../hooks/useMyLibrary';
import { useLoginGate } from '../../auth/loginGate';
import AppIcon from '../../shared/AppIcon';
import DioButton from '../../shared/DioButton';
import { styles as shell } from '../styles';
import { colors } from '../../shared/theme';
import { openFontStudio, studioSnapshot, subscribeStudio } from '../../handwriting/studioBus';
import { refreshPersonalFonts } from '../../handwriting/library';
import { fontWorkflow } from '../../handwriting/manager';
import { listStatus } from '../../handwriting/workflow';
import { loadedFontFamily } from '../../editor/utils/text';
import { useCustomDecor } from '../../editor/hooks/useCustomDecor';
import { stickerSplit } from '../../editor/services/stickerSplit';
import StickerSplitModal from '../../editor/components/panels/StickerSplitModal';
import StickerCutoutModal from '../../editor/components/panels/StickerCutoutModal';
import StickerThumbImage from '../../editor/components/controls/StickerThumbImage';
import ConfirmDialog from '../../editor/components/controls/ConfirmDialog';
import DecorSaveNotice from '../../editor/components/panels/DecorSaveNotice';

const STICKER_REMOVE_MESSAGE = '편집기 스티커 보관함에서도 사라져요. 다이어리에 이미 붙인 내용은 유지돼요.';

// 공방은 폰트 · 스티커 · 표지 · 속지 · 색상 다섯 종류를 위쪽 인덱스 탭으로 하나씩 연다(카드를 쌓지 않는다).
// 만들기 도구는 그 종류의 도구함 한 줄에 버튼으로 둔다. 마지막으로 본 종류는 공방을 다시 열어도 그대로다(앱을 끄기 전까지).
const TABS = [
  { id: 'fonts', label: '폰트' },
  { id: 'stickers', label: '스티커' },
  { id: 'covers', label: '표지' },
  { id: 'papers', label: '속지' },
  { id: 'presets', label: '도구' },
];
let lastTab = 'fonts';

export default function DecorationStudioScreen({ compact = false, registerBackHandler }) {
  const custom = useCustomDecor();
  const library = useMyLibrary();
  const paperStyle = useDefaultPaperStyle();
  const studio = useSyncExternalStore(subscribeStudio, studioSnapshot, studioSnapshot);
  const loginGate = useLoginGate();
  const [fonts, setFonts] = useState([]), [fontState, setFontState] = useState('loading');
  const made = useSyncExternalStore(fontWorkflow.subscribe, fontWorkflow.getSnapshot, fontWorkflow.getSnapshot);
  const [tool, setTool] = useState(null), [folderId, setFolderId] = useState(null);
  const [question, setQuestion] = useState(null), [shelfError, setShelfError] = useState(null);
  const [tab, setTabState] = useState(lastTab);
  const [paperId, setPaperId] = useState(null);
  const setTab = id => { lastTab = id; setTabState(id); setFolderId(null); setPaperId(null); };
  const alive = useRef(false), request = useRef(0);
  const folderRef = useRef(null);
  folderRef.current = folderId;
  const paperRef = useRef(null);
  paperRef.current = paperId;
  useEffect(() => registerBackHandler?.(() => {
    if (paperRef.current) { setPaperId(null); return true; }
    if (!folderRef.current) return false;
    setFolderId(null);
    return true;
  }), [registerBackHandler]);
  const folder = custom.items.folders.find(item => item.id === folderId);
  async function refreshFonts() {
    const token = ++request.current;
    setFontState('loading');
    try {
      const next = await refreshPersonalFonts();
      if (alive.current && token === request.current) { setFonts(next); setFontState('ready'); }
    } catch { if (alive.current && token === request.current) setFontState('error'); }
  }
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++; }; }, []);
  useEffect(() => { if (!studio) refreshFonts(); }, [studio]);

  // 지우기 확인 창: 스티커 · 스티커 폴더 · 나의 표지 · 나의 속지가 하나의 창을 쓴다.
  const asking = question?.draft ? { title: '이 폰트를 지울까요?', message: '작성 중인 손글씨가 모두 사라져요.' }
    : question?.cover ? { title: '이 표지를 지울까요?', message: '나의 표지에서만 사라져요. 이미 만든 다이어리는 그대로예요.' }
    : question?.paper ? { title: '이 속지를 지울까요?', message: '나의 속지에서만 사라져요. 이미 만든 다이어리는 그대로예요.' }
    : { title: question?.item ? '이 스티커를 지울까요?' : '스티커 폴더를 지울까요?', message: STICKER_REMOVE_MESSAGE };
  async function confirmRemoval() {
    const target = question;
    setQuestion(null);
    if (target?.draft) {
      setShelfError(null);
      fontWorkflow.removeDraft(target.draft.id).catch(() => { if (alive.current) setShelfError('font'); });
    }
    else if (target?.item) custom.removeFromFolder(target.folder.id, target.item);
    else if (target?.folder) { custom.removeFolder(target.folder.id); setFolderId(null); }
    else if (target?.cover || target?.paper) {
      setShelfError(null);
      const done = await (target.cover ? library.removeCover(target.cover.id) : library.removePaper(target.paper.id));
      if (!done && alive.current) setShelfError(target.cover ? 'cover' : 'paper');
      else if (target.paper && alive.current) setPaperId(null);
    }
  }
  async function renameItem(kind, item, name) {
    setShelfError(null);
    const done = await (kind === 'cover' ? library.renameCover(item.id, name) : library.renamePaper(item.id, name));
    if (!done && alive.current) setShelfError(`${kind}-rename`);
  }
  const count = list => list.length ? `${list.length}개` : null;

  // 폰트 목록은 이 탭이 직접 보여 준다: 만들던 폰트 · 생성 중인 폰트(손글씨 공방의 항목)와 가져온 폰트를 한 줄 목록으로 모으고,
  // '새로 만들기'는 손글씨 공방의 자체 목록을 거치지 않고 바로 새 폰트 입력으로, 항목을 누르면 그 폰트 화면으로 바로 간다.
  const entries = made.loaded ? made.entries : [];
  const loose = fonts.filter(font => !entries.some(entry => entry.fontId === font.id));
  const fontTotal = entries.length + loose.length;
  const fontReady = fontState === 'ready' && made.loaded;
  const fontPreview = font => {
    const family = font && !font.missing && loadedFontFamily(font.id);
    return family ? <Text numberOfLines={1} accessibilityLabel={font.label + ' 미리보기'} style={[s.fontPreview, { fontFamily: family }]}>나만의 글씨로 남기는 오늘</Text>
      : <Text style={s.description}>폰트를 불러오지 못했어요.</Text>;
  };
  const fontSection = <StudioSection fill={fontReady && !fontTotal} title="폰트" count={fontReady ? count({ length: fontTotal }) : null} stacked={compact}
    right={<StudioTool icon="text" title="새로 만들기" description="손글씨를 나만의 글꼴로" block={compact} onPress={() => loginGate('내 폰트 만들기', () => openFontStudio({ create: true }))} />}>
    {shelfError === 'font' && <Text accessibilityRole="alert" style={s.error}>폰트를 지우지 못했어요. 다시 시도해 주세요.</Text>}
    {fontState === 'error' ? <View accessibilityRole="alert" style={s.alert}><Text style={s.empty}>폰트 목록을 불러오지 못했어요.</Text><DioButton variant="tonal" label="폰트 목록 다시 불러오기" onPress={refreshFonts} /></View>
      : !fontReady ? <Text style={s.empty}>폰트를 불러오고 있어요.</Text>
      : !fontTotal ? <EmptyState compact={compact} art="dio" raised title="아직 만든 폰트가 없어요" />
      : <View style={s.fontList}>
        {entries.map(entry => {
          const status = listStatus(entries, entry);
          return <View key={entry.id} style={[s.fontRow, s.fontRowLine, compact && s.fontRowCompact]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${entry.name} ${status}`} onPress={() => loginGate('내 폰트 만들기', () => openFontStudio({ open: entry.id }))} style={s.fontOpen}>
              <Text style={s.itemTitle}>{entry.name}</Text>
              {entry.status === 'ready' ? fontPreview(fonts.find(font => font.id === entry.fontId)) : <Text style={s.description}>{status}</Text>}
            </Pressable>
            {entry.status === 'draft' ? <DioButton variant="icon" icon="trash" label={`${entry.name} 삭제`} onPress={() => setQuestion({ draft: entry })} /> : <AppIcon name="chevron-right" size={20} color={colors.textMuted} />}
          </View>;
        })}
        {loose.map(font => <View key={font.id} style={[s.fontRow, compact && s.fontRowCompact]}>
          <Text style={s.itemTitle}>{font.label}</Text>
          {fontPreview(font)}
        </View>)}
      </View>}
  </StudioSection>;

  const stickerSection = <StudioSection fill={custom.loaded && (folder ? !folder.items.length : !custom.items.folders.length)} title={folder ? folder.name : '스티커'} count={custom.loaded ? (folder ? count(folder.items) : count(custom.items.folders)) : null}
    stacked={compact && !folder} right={folder ? <>
      <DioButton variant="ghost" icon="chevron-left" label="스티커 폴더 목록" text="폴더 목록" onPress={() => setFolderId(null)} />
      <DioButton variant="icon" icon="trash" label="스티커 폴더 삭제" onPress={() => setQuestion({ folder })} />
    </> : <>
      <StudioTool icon="scissors" title="사진 속 대상 오리기" description="사진 속 원하는 대상만" block={compact} onPress={() => loginGate('사진 속 대상 오리기', () => setTool('cutout'))} />
      <StudioTool icon="grid" title="스티커 시트 분리" description="시트 속 그림을 개별 스티커로" block={compact} onPress={() => loginGate('스티커 시트 분리', () => setTool('split'))}
        disabled={!custom.loaded || !stickerSplit.available} />
    </>}>
    {custom.saveError ? <DecorSaveNotice error={custom.saveError} pending={custom.savePending} onRetry={custom.retrySave} /> : null}
    {!custom.loaded ? <Text style={s.empty}>스티커를 불러오고 있어요.</Text>
      : folder ? (!folder.items.length ? <EmptyState compact={compact} art="dio" raised title="아직 스티커가 없어요" />
        : <View style={s.stickers}>{folder.items.map((item, index) => <View key={item.id || `${item.mediaFileId || item.src}-${index}`} style={s.sticker}>
            <StickerThumbImage item={item} style={s.stickerThumb} />
            <Pressable accessibilityRole="button" accessibilityLabel={`${index + 1}번 스티커 삭제`} hitSlop={12}
              onPress={() => setQuestion({ folder, item })} style={s.stickerRemove}>
              <AppIcon name="close" size={12} color={colors.primaryText} />
            </Pressable>
          </View>)}</View>)
      : !custom.items.folders.length ? <EmptyState compact={compact} art="dio" raised title="아직 스티커 폴더가 없어요" />
      : <View style={s.folders}>
          {custom.items.folders.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name} 스티커 폴더`}
            onPress={() => setFolderId(item.id)} style={[s.folderTile, compact && s.folderTileCompact]}>
            <View style={s.folderPreviews}>{item.items.length ? item.items.slice(0, 2).map((sticker, index) => <View key={index} style={s.folderPreview}><StickerThumbImage item={sticker} style={s.folderThumb} /></View>)
              : <View style={s.folderPreview}><AppIcon name="folder" size={26} color={colors.primary} /></View>}</View>
            <View style={s.folderText}><Text numberOfLines={1} style={s.itemTitle}>{item.name}</Text><Text style={s.folderCount}>{item.items.length}개 스티커</Text></View>
          </Pressable>)}
          {/* 마지막 칸은 늘 '+': 사진에서 오려 새 스티커를 만든다 */}
          <Pressable accessibilityRole="button" accessibilityLabel="새 스티커 만들기" onPress={() => loginGate('사진 속 대상 오리기', () => setTool('cutout'))}
            style={[s.folderTile, s.addTile, compact && s.folderTileCompact]}>
            <AppIcon name="add" size={24} color={colors.primaryText} />
          </Pressable>
        </View>}
  </StudioSection>;

  const coverSection = <StudioSection fill={library.ready && !library.covers.length} title="표지" count={library.ready ? count(library.covers) : null}>
    {!library.ready ? <Text style={s.empty}>표지를 불러오고 있어요.</Text>
      : !library.covers.length ? <EmptyState compact={compact} art="dio" raised title="아직 저장한 표지가 없어요" />
      : <StudioShelf kind="cover" items={library.covers} onRemove={cover => setQuestion({ cover })} onRename={(cover, name) => renameItem('cover', cover, name)} />}
    {shelfError === 'cover' && <Text accessibilityRole="alert" style={s.error}>표지를 지우지 못했어요. 다시 시도해 주세요.</Text>}
    {shelfError === 'cover-rename' && <Text accessibilityRole="alert" style={s.error}>표지 이름을 바꾸지 못했어요. 다시 시도해 주세요.</Text>}
  </StudioSection>;

  // 기본 속지 설정과 저장한 속지 목록을 둘 다 읽은 뒤 한 번에 그린다(따로 그리면 늦게 온 쪽이 끼어들며 아래 것이 밀려 내려갔다)
  const papersReady = library.ready && paperStyle.ready;
  const openPaper = library.papers.find(item => item.id === paperId);
  const wide = openPaper?.orientation === 'landscape';
  // 속지 하나를 펼친 모습: 스티커 폴더처럼 안의 쪽을 전부 보여 준다(쪽 번호 아래)
  const paperDetail = openPaper && <StudioSection title={openPaper.name} count={`${openPaper.pages.length}장`}
    right={<>
      <DioButton variant="ghost" icon="chevron-left" label="속지 목록" text="속지 목록" onPress={() => setPaperId(null)} />
      <DioButton variant="icon" icon="trash" label="속지 삭제" onPress={() => setQuestion({ paper: openPaper })} />
    </>}>
    <View style={s.pages}>{openPaper.pages.map((page, index) => <View key={`${page.mediaFileId}-${index}`} style={s.page}>
      <PdfPageThumb page={page} width={wide ? 154 : 116} ratio={wide ? 4 / 3 : 3 / 4} style={s.pageThumb} />
      <Text style={s.pageNumber}>{index + 1}</Text>
    </View>)}</View>
  </StudioSection>;
  const paperSection = paperDetail ||  <StudioSection fill={papersReady && !library.papers.length} title="속지" count={papersReady ? count(library.papers) : null}>
    {papersReady && <StudioPaperStyle compact={compact} style={paperStyle.style} save={paperStyle.save} />}
    {papersReady && <View style={[s.divider, s.paperDivider]} />}
    {papersReady && <GroupHead icon="paper" title="내 속지" line={false} />}
    {!papersReady ? <Text style={s.empty}>속지를 불러오고 있어요.</Text>
      : !library.papers.length ? <EmptyState compact={compact} art="dio" raised title="아직 저장한 속지가 없어요" />
      : <StudioShelf kind="paper" items={library.papers} onOpen={paper => setPaperId(paper.id)} onRemove={paper => setQuestion({ paper })} onRename={(paper, name) => renameItem('paper', paper, name)} />}
    {shelfError === 'paper' && <Text accessibilityRole="alert" style={s.error}>속지를 지우지 못했어요. 다시 시도해 주세요.</Text>}
    {shelfError === 'paper-rename' && <Text accessibilityRole="alert" style={s.error}>속지 이름을 바꾸지 못했어요. 다시 시도해 주세요.</Text>}
  </StudioSection>;

  const presetSection = <StudioSection title="도구"><StudioPresets compact={compact} /></StudioSection>;

  const current = { fonts: fontSection, stickers: stickerSection, covers: coverSection, papers: paperSection, presets: presetSection }[tab] ?? fontSection;

  return <View style={s.root}>
    <ScrollView contentContainerStyle={[shell.screen, compact && shell.screenCompact, s.content, compact && s.contentCompact]}>
      <Header title="꾸미기 공방" icon="workshop" compact={compact} />
      <StudioTabs tabs={TABS} value={tab} onChange={setTab} compact={compact} />
      {current}
    </ScrollView>
    {tool === 'split' && <StickerSplitModal onClose={() => setTool(null)} onSave={async (id, name, stickers) => {
      const cleanName = name.trim();
      await custom.saveGenerated(id, cleanName, stickers);
      setFolderId(null);
    }} />}
    {tool === 'cutout' && <StickerCutoutModal folder={folder} onClose={() => setTool(null)} />}
    <ConfirmDialog open={Boolean(question)} title={asking.title} message={asking.message}
      confirmLabel="삭제" danger onCancel={() => setQuestion(null)} onConfirm={confirmRemoval} />
  </View>;
}

const s = StyleSheet.create({
  // 카드를 쌓지 않는 대신 화면 전체를 흰 면(surface) 한 장으로 둔다. 옅은 면(surfaceMuted)의 탭 · 도구함이 그 위에서 보인다
  root: { flex: 1, backgroundColor: colors.surface }, content: { flexGrow: 1, paddingBottom: 36 },
  // 폰은 하단 내비게이션 위에서 끝나게 104(코덱스 11번)
  contentCompact: { paddingBottom: 104 },
  alert: { gap: 8, alignItems: 'flex-start' },
  // 폰트: 카드 없이 아래 구분선 목록(넓으면 2열)
  fontList: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24 },
  fontRow: { flexGrow: 1, flexBasis: 360, minWidth: 0, minHeight: 76, justifyContent: 'center', gap: 4, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  fontRowCompact: { flexBasis: '100%' },
  fontRowLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fontOpen: { flex: 1, minWidth: 0, gap: 4 },
  fontPreview: { fontSize: 18, lineHeight: 28, color: colors.text },
  description: { fontSize: 13, fontWeight: '600', lineHeight: 19, color: colors.textMuted },
  itemTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  empty: { color: colors.textMuted, fontSize: 13, fontWeight: '600', lineHeight: 19, paddingVertical: 4 },
  error: { color: colors.dangerStrong, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.cardBorder, marginVertical: 4 },
  paperDivider: { marginTop: 16, marginBottom: 8 }, // 기본 속지 설정 끝에서 32, 내 속지 머리까지 24(코덱스 2026-11-02) // 탭 아래 선 · 프리셋 구분선과 같은 굵기 · 색
  // 스티커 폴더: 서랍 앞면 같은 얕은 타일, 위에 앞 스티커 두 장, 아래 이름 · 개수. 마지막은 '+' 칸
  folders: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  // 폭 164 = 스티커 두 장(64 + 8 + 64) + 좌우 여백 14씩: 오른쪽 여백이 왼쪽과 같다
  folderTile: { width: 164, minHeight: 144, justifyContent: 'space-between', gap: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  folderTileCompact: { width: '47.5%' },
  folderPreviews: { flexDirection: 'row', gap: 8 },
  // 좁은 폰에서 두 장이 칸을 넘지 않게 64 까지 줄어든다
  folderPreview: { flexBasis: 64, flexShrink: 1, maxWidth: 64, aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  folderText: { gap: 3 },
  folderCount: { fontSize: 12, fontWeight: '500', lineHeight: 17, color: colors.textMuted },
  folderThumb: { width: 56, height: 56 },
  addTile: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: 'transparent' },
  // 폴더 안 스티커: 88×88 칸
  pages: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  page: { gap: 6, alignItems: 'center' },
  pageThumb: { borderRadius: 8, borderWidth: 1, borderColor: colors.cardBorder },
  pageNumber: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  stickers: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  sticker: { width: 88, height: 88, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  stickerThumb: { width: '100%', height: '100%' },
  stickerRemove: { position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
