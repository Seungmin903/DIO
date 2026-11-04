import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import useFillGrid from '../../shared/useFillGrid';
import DioButton from '../../shared/DioButton';
import { styles as shell } from '../styles';
import { colors } from '../../shared/theme';
import { openFontStudio, studioSnapshot, subscribeStudio } from '../../handwriting/studioBus';
import { refreshPersonalFonts } from '../../handwriting/library';
import { fontWorkflow } from '../../handwriting/manager';
import { listStatus } from '../../handwriting/workflow';
import { AI_FONT_LABEL, isAiHandwritingFont } from '../../handwriting/aiDisclosure';
import { CUTOUT_ENTRANCE } from '../../shared/featureFlags';
import { loadedFontFamily } from '../../editor/utils/text';
import { useCustomDecor } from '../../editor/hooks/useCustomDecor';
import { stickerSplit } from '../../editor/services/stickerSplit';
import StickerSplitModal from '../../editor/components/panels/StickerSplitModal';
import StickerCutoutModal from '../../editor/components/panels/StickerCutoutModal';
import StickerThumbImage from '../../editor/components/controls/StickerThumbImage';
import TapeView, { tapePreviewBox } from '../../editor/components/canvas/TapeView';
import TapeCropper from '../../editor/components/panels/TapeCropper';
import PhotoCropper from '../../editor/components/panels/PhotoCropper';
import { COVER_PHOTO_RATIO, coverCropPhoto } from '../utils/coverPhotoCrop';
import { TAPE_SIZES } from '../../editor/constants';
import ConfirmDialog from '../../editor/components/controls/ConfirmDialog';
import DecorSaveNotice from '../../editor/components/panels/DecorSaveNotice';
import DiaryActionBubble from '../components/DiaryActionBubble';
import { PdfImportError, coverWithPdfPage, pdfOrientation } from '../utils/pdfImport';
import { pickPdfPages } from '../utils/pdfPages';
import { discardPdfImport } from '../utils/pdfCleanup';
import { newDiaryCover } from '../utils/coverDesign';
import { pickImages } from '../../editor/services/image';
import { discardGeneratedMedia } from '../../editor/services/mediaStore';
import { mediaFailureMessage } from '../../editor/utils/mediaRecovery.js';

const STICKER_REMOVE_MESSAGE = '편집기 스티커 보관함에서도 사라져요. 다이어리에 이미 붙인 내용은 유지돼요.';
// 테이프 이름 최대 글자 수: 보관함 칸(정사각 64, 이름 12px)에 한글 5자까지 한 줄로 보이고, 자동 이름 '테이프 10' 도 고칠 수 있게 6
const TAPE_NAME_MAX = 6;
const TAPE_REMOVE_MESSAGE = '편집기 내 테이프에서도 사라져요. 다이어리에 이미 붙인 테이프는 유지돼요.';
// 저장한 사진 테이프 미리보기: 등록할 때 정한 조각 비율대로(편집기 보관함과 같다). 예전 테이프는 규격 비율
const sizeRatio = sizeId => { const size = TAPE_SIZES.find(item => item.id === sizeId) ?? TAPE_SIZES[1]; return size.w / size.h; };
const TapePreview = ({ tape, width, minH, maxH }) => {
  const box = tapePreviewBox(tape, width, minH, maxH, sizeRatio(tape.size));
  return <TapeView src={tape.src} mediaFileId={tape.mediaFileId} crop={tape.crop} imageWidth={tape.imageWidth} imageHeight={tape.imageHeight}
    edge="straight" width={box.width} height={box.height} segmentShare={box.segmentShare} pieceRatio={box.pieceRatio} crisp />;
};

// 공방은 폰트 · 스티커 · 테이프 · 표지 · 속지 · 도구 여섯 종류를 위쪽 인덱스 탭으로 하나씩 연다(카드를 쌓지 않는다).
// 만들기는 종류마다 제목 줄 오른쪽 '○○ 추가' 버튼 하나(그 종류의 아이콘). 방법이 여럿(스티커 · 표지)이면 다이어리 카드 ⋯ 와 같은 동작 말풍선으로 고르고, 하나(폰트 · 속지)면 바로 연다. 마지막으로 본 종류는 공방을 다시 열어도 그대로다(앱을 끄기 전까지).
const TABS = [
  { id: 'fonts', label: '폰트' },
  { id: 'stickers', label: '스티커' },
  { id: 'tapes', label: '테이프' },
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
  // 테이프: 연 폴더, 이름 고치는 중인 글(null 이면 고치지 않음), 자르기 화면에 넘긴 사진({ image, folderId })
  const [tapeFolderId, setTapeFolderId] = useState(null), [tapeRename, setTapeRename] = useState(null), [pendingTape, setPendingTape] = useState(null);
  // 테이프 이름 고치기(카드 이름을 누르면 그 자리에서): { id, draft }
  const [tapeNameEdit, setTapeNameEdit] = useState(null);
  // 사진으로 표지 만들기의 자르기 창: { photo, ratio, resolve }
  const [coverCrop, setCoverCrop] = useState(null);
  // 좌우 끝을 목록 여백에 맞추는 격자: 폴더 · 스티커는 칸을 늘리고, 속지 쪽 썸네일은 크기가 정해져 사이를 넓힌다(useFillGrid)
  const folderGrid = useFillGrid({ cell: 164, gap: 14, minColumns: 2 });
  const stickerGrid = useFillGrid({ cell: 88, gap: 12, minColumns: 3 });
  const tapeGrid = useFillGrid({ cell: 200, gap: 14, minColumns: 1 });
  const pageGrid = useFillGrid({ cell: library.papers.find(item => item.id === paperId)?.orientation === 'landscape' ? 154 : 116, gap: 14 });
  // '○○ 추가' 말풍선: 어느 종류인지와 버튼 자리(anchor). 버튼마다 자리를 재려고 감싼 칸을 기억해 둔다
  const [addMenu, setAddMenu] = useState(null);
  const addButtons = useRef({});
  // 공방에서 표지 · 속지 만들기: 지금 하는 일('cover-pdf' | 'cover-photo' | 'paper'), PDF 쪽 그리기 진행, 실패 알림({ kind, text })
  const [making, setMaking] = useState(null), [makeProgress, setMakeProgress] = useState(null), [makeError, setMakeError] = useState(null);
  const setTab = id => { lastTab = id; setTabState(id); setFolderId(null); setPaperId(null); setTapeFolderId(null); setTapeRename(null); };
  const alive = useRef(false), request = useRef(0);
  const folderRef = useRef(null);
  folderRef.current = folderId;
  const paperRef = useRef(null);
  paperRef.current = paperId;
  const tapeRef = useRef(null);
  tapeRef.current = tapeFolderId;
  useEffect(() => registerBackHandler?.(() => {
    if (paperRef.current) { setPaperId(null); return true; }
    if (tapeRef.current) { setTapeFolderId(null); setTapeRename(null); return true; }
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
    : question?.tapeFolder ? { title: question.tape ? '이 테이프를 지울까요?' : '테이프 폴더를 지울까요?', message: TAPE_REMOVE_MESSAGE }
    : { title: question?.item ? '이 스티커를 지울까요?' : '스티커 폴더를 지울까요?', message: STICKER_REMOVE_MESSAGE };
  async function confirmRemoval() {
    const target = question;
    setQuestion(null);
    if (target?.draft) {
      setShelfError(null);
      fontWorkflow.removeDraft(target.draft.id).catch(() => { if (alive.current) setShelfError('font'); });
    }
    else if (target?.tapeFolder) {
      if (target.tape) custom.removeTape(target.tapeFolder.id, target.tape.id);
      else { custom.removeTapeFolder(target.tapeFolder.id); setTapeFolderId(null); setTapeRename(null); }
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
  const openAddMenu = kind => {
    const node = addButtons.current[kind];
    if (node?.measureInWindow) node.measureInWindow((x, y, width, height) => setAddMenu({ kind, anchor: { x, y, width, height } }));
    else setAddMenu({ kind, anchor: null });
  };
  // 공방의 '○○ 추가' 버튼(폰은 제목 아래 전폭). menu 이면 말풍선을 열고, 아니면 onPress 를 바로 부른다
  const addTool = ({ kind, icon, title, description, disabled = false, menu = false, onPress }) =>
    <View ref={node => { addButtons.current[kind] = node; }} collapsable={false} style={compact && s.toolBlock}>
      <StudioTool icon={icon} title={title} description={description} block={compact} disabled={disabled} onPress={menu ? () => openAddMenu(kind) : onPress} />
    </View>;

  const fontSection = <StudioSection fill={fontReady && !fontTotal} title="폰트" count={fontReady ? count({ length: fontTotal }) : null} stacked={compact}
    right={addTool({ kind: 'font', icon: 'text', title: '폰트 추가', description: '손글씨를 나만의 글꼴로', onPress: () => loginGate('내 폰트 만들기', () => openFontStudio({ create: true })) })}>
    {shelfError === 'font' && <Text accessibilityRole="alert" style={s.error}>폰트를 지우지 못했어요. 다시 시도해 주세요.</Text>}
    {/* 손글씨 공방 상태를 못 읽으면(loaded 가 오지 않음) 불러오는 중에 갇히지 않게 오류와 다시 불러오기를 보인다 */}
    {fontState === 'error' || (!made.loaded && made.error) ? <View accessibilityRole="alert" style={s.alert}><Text style={s.empty}>폰트 목록을 불러오지 못했어요.</Text><DioButton variant="tonal" label="폰트 목록 다시 불러오기" onPress={() => { if (!made.loaded) fontWorkflow.init().catch(() => {}); refreshFonts(); }} /></View>
      : !fontReady ? <Text style={s.empty}>폰트를 불러오고 있어요.</Text>
      : !fontTotal ? <EmptyState compact={compact} art="dio" raised title="아직 만든 폰트가 없어요" />
      : <View style={s.fontList}>
        {entries.map(entry => {
          const status = listStatus(entries, entry);
          return <View key={entry.id} style={[s.fontRow, s.fontRowLine, compact && s.fontRowCompact]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${entry.name} ${status}`} onPress={() => loginGate('내 폰트 만들기', () => openFontStudio({ open: entry.id }))} style={s.fontOpen}>
              <Text style={s.itemTitle}>{entry.name}</Text>
              {entry.status === 'ready' && (entry.jobId || isAiHandwritingFont(fonts.find(font => font.id === entry.fontId))) ? <Text style={s.description}>{AI_FONT_LABEL}</Text> : null}
              {entry.status === 'ready' ? fontPreview(fonts.find(font => font.id === entry.fontId)) : <Text style={s.description}>{status}</Text>}
            </Pressable>
            {entry.status === 'draft' ? <DioButton variant="icon" icon="trash" label={`${entry.name} 삭제`} onPress={() => setQuestion({ draft: entry })} /> : <AppIcon name="chevron-right" size={20} color={colors.textMuted} />}
          </View>;
        })}
        {loose.map(font => <View key={font.id} style={[s.fontRow, compact && s.fontRowCompact]}>
          <Text style={s.itemTitle}>{font.label}</Text>
          {isAiHandwritingFont(font) && <Text style={s.description}>{AI_FONT_LABEL}</Text>}
          {fontPreview(font)}
        </View>)}
      </View>}
  </StudioSection>;

  const stickerSection = <StudioSection fill={custom.loaded && (folder ? !folder.items.length : !custom.items.folders.length)} title={folder ? folder.name : '스티커'} count={custom.loaded ? (folder ? count(folder.items) : count(custom.items.folders)) : null}
    stacked={compact && !folder} right={folder ? <>
      <DioButton variant="ghost" icon="chevron-left" label="스티커 폴더 목록" text="폴더 목록" onPress={() => setFolderId(null)} />
      <DioButton variant="icon" icon="trash" label="스티커 폴더 삭제" onPress={() => setQuestion({ folder })} />
    </> : addTool({ kind: 'sticker', icon: 'sticker', title: '스티커 추가', description: CUTOUT_ENTRANCE ? '스티커 시트 분리 · 사진 속 대상 오리기' : '스티커 시트 분리', disabled: !custom.loaded, menu: true })}>
    {custom.saveError ? <DecorSaveNotice error={custom.saveError} pending={custom.savePending} onRetry={custom.retrySave} /> : null}
    {!custom.loaded ? <Text style={s.empty}>스티커를 불러오고 있어요.</Text>
      : folder ? (!folder.items.length ? <EmptyState compact={compact} art="dio" raised title="아직 스티커가 없어요" />
        : <View style={s.stickers} onLayout={stickerGrid.onLayout}>{folder.items.map((item, index) => <View key={item.id || `${item.mediaFileId || item.src}-${index}`} style={[s.sticker, { width: stickerGrid.cellWidth, height: stickerGrid.cellWidth }]}>
            <StickerThumbImage item={item} style={s.stickerThumb} />
            <Pressable accessibilityRole="button" accessibilityLabel={`${index + 1}번 스티커 삭제`} hitSlop={12}
              onPress={() => setQuestion({ folder, item })} style={s.stickerRemove}>
              <AppIcon name="close" size={12} color={colors.primaryText} />
            </Pressable>
          </View>)}</View>)
      : !custom.items.folders.length ? <EmptyState compact={compact} art="dio" raised title="아직 스티커 폴더가 없어요" />
      : <View style={s.folders} onLayout={folderGrid.onLayout}>
          {custom.items.folders.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name} 스티커 폴더`}
            onPress={() => setFolderId(item.id)} style={[s.folderTile, { width: folderGrid.cellWidth }]}>
            <View style={s.folderPreviews}>{item.items.length ? item.items.slice(0, 2).map((sticker, index) => <View key={index} style={s.folderPreview}><StickerThumbImage item={sticker} style={s.folderThumb} /></View>)
              : <View style={s.folderPreview}><AppIcon name="folder" size={26} color={colors.primary} /></View>}</View>
            <View style={s.folderText}><Text numberOfLines={1} style={s.itemTitle}>{item.name}</Text><Text style={s.folderCount}>{item.items.length}개 스티커</Text></View>
          </Pressable>)}
        </View>}
  </StudioSection>;

  // 표지 · 속지 만들기는 새 다이어리의 PDF 불러오기 · 표지 사진 고르기와 같은 길을 쓴다.
  // 표지는 PDF 첫 쪽(또는 사진)을 바탕으로 한 꾸밈 없는 표지, 속지는 PDF 쪽 전부. 이름은 PDF 파일 이름이고 선반에서 바꿀 수 있다.
  const saveFailed = kind => `${kind === 'paper' ? '속지' : '표지'}를 저장하지 못했어요. 다시 시도해 주세요.`;
  const makeFromPdf = async kind => {
    if (making) return;
    setMaking(kind === 'paper' ? 'paper' : 'cover-pdf'); setMakeProgress(null); setMakeError(null);
    let result = null;
    try {
      result = await pickPdfPages({ onProgress: (done, total) => { if (alive.current) setMakeProgress({ done, total }); } });
      if (!result?.pages.length) return;
      const first = result.pages[0], orientation = pdfOrientation(first.aspect);
      const saved = kind === 'paper'
        ? await library.addPaper({ name: result.name, orientation, pages: result.pages })
        : await library.addCover({ name: result.name, orientation, cover: coverWithPdfPage(newDiaryCover(), first) });
      if (!saved) { if (alive.current) setMakeError({ kind, text: saveFailed(kind) }); return; }
      // 표지는 첫 쪽 그림만 쓰므로 나머지 쪽 그림과 원본 PDF 는 바로 지운다
      if (kind === 'cover') discardPdfImport({ pages: result.pages.slice(1), sourceId: result.sourceId }).catch(() => {});
      result = null;
    } catch (failure) {
      if (alive.current) setMakeError({ kind, text: failure instanceof PdfImportError ? failure.message : mediaFailureMessage(failure) });
    } finally {
      if (result) discardPdfImport(result).catch(() => {});
      if (alive.current) { setMaking(null); setMakeProgress(null); }
    }
  };
  const makeCoverFromPhoto = async () => {
    if (making) return;
    setMaking('cover-photo'); setMakeError(null);
    try {
      const [item] = await pickImages({ multiple: false, usage: 'photo' });
      if (!item) return;
      // 사진 넣기 흐름: 고르기 → 사진 방향의 표지 비율로 자르기 → 나의 표지에 보인다. 자르기를 닫으면 만들지 않는다
      const orientation = pdfOrientation(item.aspect);
      const crop = await new Promise(resolve => setCoverCrop({ photo: item, ratio: COVER_PHOTO_RATIO[orientation], resolve }));
      if (!crop) { discardGeneratedMedia([item]).catch(() => {}); return; }
      // 이름은 편집기 사진과 같은 규칙: 파일 이름, 없으면(뜻 없는 이름 포함) 나의 표지 안에서 '사진 n'
      const last = library.covers.reduce((max, cover) => Math.max(max, Number(cover.name.match(/^사진 (\d+)$/)?.[1] ?? 0)), 0);
      const base = coverWithPdfPage(newDiaryCover(), item);
      const saved = await library.addCover({ name: item.name || `사진 ${last + 1}`, orientation, cover: { ...base, photo: { ...base.photo, crop } } });
      if (!saved) { discardGeneratedMedia([item]).catch(() => {}); if (alive.current) setMakeError({ kind: 'cover', text: saveFailed('cover') }); }
    } catch (failure) {
      if (alive.current) setMakeError({ kind: 'cover', text: mediaFailureMessage(failure) });
    } finally { if (alive.current) setMaking(null); }
  };
  // PDF 를 불러오는 동안은 그 종류의 추가 버튼 글자가 진행으로 바뀐다
  const addTitle = (kind, title) => (kind === 'paper' ? making === 'paper' : making === 'cover-pdf') && makeProgress ? `PDF 불러오는 중 ${makeProgress.done}/${makeProgress.total}` : title;
  const makeAlert = kind => makeError?.kind === kind ? <Text accessibilityRole="alert" style={s.error}>{makeError.text}</Text> : null;

  // 테이프: 스티커처럼 폴더로 모은다. 폴더 타일(앞 테이프 두 장 + 이름 · 개수) → 폴더 안 테이프 목록.
  // '테이프 추가'는 사진으로 만들기(편집기 보관함과 같은 자르기 화면) · 새 폴더. 폴더 안에서는 이 폴더에 추가 · 이름 바꾸기 · 폴더 삭제
  const tapeFolders = custom.items.tapeFolders ?? [];
  const tapeFolder = tapeFolders.find(item => item.id === tapeFolderId);
  const addTapeFromPhoto = async targetId => {
    setShelfError(null);
    try {
      const [image] = await pickImages({ multiple: false, usage: 'tape' });
      if (image && alive.current) setPendingTape({ image, folderId: targetId });
    } catch { if (alive.current) setShelfError('tape'); }
  };
  const newTapeFolder = () => { const id = custom.addTapeFolder('새 폴더'); setTapeFolderId(id); setTapeRename('새 폴더'); };
  const commitTapeRename = () => {
    const name = (tapeRename ?? '').trim();
    if (name && tapeFolder && name !== tapeFolder.name) custom.renameTapeFolder(tapeFolder.id, name);
    setTapeRename(null);
  };
  const tapeTileWidth = folderGrid.cellWidth - 28; // 폴더 타일 안쪽(좌우 14)
  // 한 줄 입력은 완료를 누르면 blur 도 따라와 두 번 불린다(StudioShelf 와 같다). 빈 이름이면 바꾸지 않는다
  const commitTapeName = (folderId, item) => {
    if (!tapeNameEdit || tapeNameEdit.id !== item.id) return;
    const name = tapeNameEdit.draft.trim();
    setTapeNameEdit(null);
    if (name && name !== item.name) custom.renameTape(folderId, item.id, name);
  };
  const tapeCardWidth = tapeGrid.cellWidth - 32; // 테이프 카드 안쪽(좌우 16)
  const tapeSection = <StudioSection fill={custom.loaded && (tapeFolder ? !tapeFolder.items.length : !tapeFolders.length)} title={tapeFolder ? tapeFolder.name : '테이프'} count={custom.loaded ? (tapeFolder ? count(tapeFolder.items) : count(tapeFolders)) : null}
    stacked={compact && !tapeFolder} right={tapeFolder ? <>
      <DioButton variant="ghost" icon="chevron-left" label="테이프 폴더 목록" text="폴더 목록" onPress={() => { setTapeFolderId(null); setTapeRename(null); }} />
      <DioButton variant="icon" icon="add" label="이 폴더에 테이프 추가" onPress={() => addTapeFromPhoto(tapeFolder.id)} />
      <DioButton variant="icon" icon="edit" label="테이프 폴더 이름 바꾸기" onPress={() => setTapeRename(tapeFolder.name)} />
      <DioButton variant="icon" icon="trash" label="테이프 폴더 삭제" onPress={() => setQuestion({ tapeFolder })} />
    </> : addTool({ kind: 'tape', icon: 'tape', title: '테이프 추가', description: '사진으로 만들기 · 새 폴더', disabled: !custom.loaded, menu: true })}>
    {custom.saveError ? <DecorSaveNotice error={custom.saveError} pending={custom.savePending} onRetry={custom.retrySave} /> : null}
    {shelfError === 'tape' && <Text accessibilityRole="alert" style={s.error}>사진을 불러오지 못했어요. 다시 시도해 주세요.</Text>}
    {tapeFolder && tapeRename != null && <View style={s.renameRow}>
      <TextInput autoFocus selectTextOnFocus maxLength={30} value={tapeRename} onChangeText={setTapeRename} onSubmitEditing={commitTapeRename}
        returnKeyType="done" accessibilityLabel="테이프 폴더 이름" style={s.renameInput} />
      <DioButton variant="ghost" label="폴더 이름 바꾸기 취소" text="취소" onPress={() => setTapeRename(null)} />
      <DioButton variant="filled" label="폴더 이름 저장" text="저장" disabled={!tapeRename.trim()} onPress={commitTapeRename} />
    </View>}
    {!custom.loaded ? <Text style={s.empty}>테이프를 불러오고 있어요.</Text>
      : tapeFolder ? (!tapeFolder.items.length ? <EmptyState compact={compact} art="dio" raised title="아직 테이프가 없어요" />
        : <View style={s.tapes} onLayout={tapeGrid.onLayout}>{tapeFolder.items.map((item, index) => <View key={item.id} style={[s.tapeCard, { width: tapeGrid.cellWidth }]}>
            <TapePreview tape={item} width={tapeCardWidth} minH={12} maxH={72} />
            {/* 이름(자동 '테이프 n'): 누르면 그 자리에서 고친다 */}
            {tapeNameEdit?.id === item.id
              ? <TextInput autoFocus selectTextOnFocus maxLength={TAPE_NAME_MAX} value={tapeNameEdit.draft} accessibilityLabel="테이프 이름"
                onChangeText={draft => setTapeNameEdit({ id: item.id, draft })} onSubmitEditing={() => commitTapeName(tapeFolder.id, item)} onBlur={() => commitTapeName(tapeFolder.id, item)}
                returnKeyType="done" style={[s.tapeName, s.tapeNameInput]} />
              : <Pressable accessibilityRole="button" accessibilityLabel={`테이프 ${item.name} 이름 고치기`} onPress={() => setTapeNameEdit({ id: item.id, draft: item.name ?? '' })} style={s.tapeNameRow}>
                <Text numberOfLines={1} style={[s.tapeName, s.tapeNameText]}>{item.name}</Text>
                <AppIcon name="edit" size={12} forText={14} color={colors.textMuted} />
              </Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel={`${index + 1}번 테이프 삭제`} hitSlop={12}
              onPress={() => setQuestion({ tapeFolder, tape: item })} style={s.stickerRemove}>
              <AppIcon name="close" size={12} color={colors.primaryText} />
            </Pressable>
          </View>)}</View>)
      : !tapeFolders.length ? <EmptyState compact={compact} art="dio" raised title="아직 테이프 폴더가 없어요" />
      : <View style={s.folders} onLayout={folderGrid.onLayout}>
          {tapeFolders.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name} 테이프 폴더`}
            onPress={() => setTapeFolderId(item.id)} style={[s.folderTile, { width: folderGrid.cellWidth }]}>
            <View style={s.tapeStack}>{item.items.length ? item.items.slice(0, 2).map(tape => <TapePreview key={tape.id} tape={tape} width={tapeTileWidth} minH={10} maxH={28} />)
              : <View style={s.folderPreview}><AppIcon name="folder" size={26} color={colors.primary} /></View>}</View>
            <View style={s.folderText}><Text numberOfLines={1} style={s.itemTitle}>{item.name}</Text><Text style={s.folderCount}>{item.items.length}개 테이프</Text></View>
          </Pressable>)}
        </View>}
  </StudioSection>;

  const coverSection = <StudioSection fill={library.ready && !library.covers.length} title="표지" count={library.ready ? count(library.covers) : null} stacked={compact}
    right={addTool({ kind: 'cover', icon: 'book', title: addTitle('cover', '표지 추가'), description: 'PDF로 만들기 · 사진으로 만들기', disabled: !library.ready || Boolean(making), menu: true })}>
    {makeAlert('cover')}
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
    <View style={[s.pages, { columnGap: pageGrid.spreadGap }]} onLayout={pageGrid.onLayout}>{openPaper.pages.map((page, index) => <View key={`${page.mediaFileId}-${index}`} style={s.page}>
      <PdfPageThumb page={page} width={wide ? 154 : 116} ratio={wide ? 4 / 3 : 3 / 4} style={s.pageThumb} />
      <Text style={s.pageNumber}>{index + 1}</Text>
    </View>)}</View>
  </StudioSection>;
  // 속지 탭 맨 위 제목은 기본 속지 설정까지 덮으므로, 저장한 속지의 개수와 '속지 추가'는 아래 '내 속지' 머리줄에 둔다(폰은 머리줄 아래 전폭)
  const paperAdd = addTool({ kind: 'paper', icon: 'paper', title: addTitle('paper', '속지 추가'), description: 'PDF 쪽을 속지로', disabled: !papersReady || Boolean(making), onPress: () => makeFromPdf('paper') });
  const paperSection = paperDetail ||  <StudioSection fill={papersReady && !library.papers.length} title="속지">
    {papersReady && <StudioPaperStyle compact={compact} style={paperStyle.style} save={paperStyle.save} />}
    {papersReady && <View style={[s.divider, s.paperDivider]} />}
    {papersReady && <GroupHead title="내 속지" section line={false} wide count={count(library.papers)} right={compact ? null : paperAdd} />}
    {papersReady && compact && paperAdd}
    {makeAlert('paper')}
    {!papersReady ? <Text style={s.empty}>속지를 불러오고 있어요.</Text>
      : !library.papers.length ? <EmptyState compact={compact} art="dio" raised title="아직 저장한 속지가 없어요" />
      : <StudioShelf kind="paper" items={library.papers} onOpen={paper => setPaperId(paper.id)} onRemove={paper => setQuestion({ paper })} onRename={(paper, name) => renameItem('paper', paper, name)} />}
    {shelfError === 'paper' && <Text accessibilityRole="alert" style={s.error}>속지를 지우지 못했어요. 다시 시도해 주세요.</Text>}
    {shelfError === 'paper-rename' && <Text accessibilityRole="alert" style={s.error}>속지 이름을 바꾸지 못했어요. 다시 시도해 주세요.</Text>}
  </StudioSection>;

  const presetSection = <StudioSection title="도구"><StudioPresets compact={compact} /></StudioSection>;

  const current = { fonts: fontSection, stickers: stickerSection, tapes: tapeSection, covers: coverSection, papers: paperSection, presets: presetSection }[tab] ?? fontSection;

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
    {/* 스티커는 편집기 스티커 보관함의 + 와 같은 이름 · 순서 · 아이콘(그곳의 '이미지 그대로 추가'는 폴더 안에서만 쓴다) */}
    {addMenu && <DiaryActionBubble anchor={addMenu.anchor} title={addMenu.kind === 'cover' ? '표지 추가' : addMenu.kind === 'tape' ? '테이프 추가' : '스티커 추가'} onClose={() => setAddMenu(null)} actions={addMenu.kind === 'tape' ? [
      { id: 'photo', label: '사진으로 만들기', text: '사진으로 만들기', icon: 'image', onPress: () => { setAddMenu(null); addTapeFromPhoto(null); } },
      { id: 'folder', label: '새 폴더', text: '새 폴더', icon: 'folder', onPress: () => { setAddMenu(null); newTapeFolder(); } },
    ] : addMenu.kind === 'cover' ? [
      { id: 'pdf', label: 'PDF로 만들기', text: 'PDF로 만들기', icon: 'upload', onPress: () => { setAddMenu(null); makeFromPdf('cover'); } },
      { id: 'photo', label: '사진으로 만들기', text: '사진으로 만들기', icon: 'image', onPress: () => { setAddMenu(null); makeCoverFromPhoto(); } },
    ] : [
      { id: 'split', label: stickerSplit.available ? '스티커 시트 분리' : `스티커 시트 분리, ${stickerSplit.reason || '이 기기에서는 쓸 수 없어요'}`, text: '스티커 시트 분리', icon: 'grid',
        disabled: !stickerSplit.available, onPress: () => { setAddMenu(null); loginGate('스티커 시트 분리', () => setTool('split')); } },
      // 사진 속 대상 오리기: 저장이 아직 미리보기 단계라(StickerCutoutModal 확인창) 모든 빌드에서 입구를 감춘다
      ...(CUTOUT_ENTRANCE ? [{ id: 'cutout', label: '사진 속 대상 오리기', text: '사진 속 대상 오리기', icon: 'scissors',
        onPress: () => { setAddMenu(null); loginGate('사진 속 대상 오리기', () => setTool('cutout')); } }] : []),
    ]} />}
    {coverCrop && <PhotoCropper photo={coverCropPhoto(coverCrop.photo, coverCrop.ratio)} fixedAspect={coverCrop.ratio} title="표지 사진 자르기"
      onCancel={() => { coverCrop.resolve(null); setCoverCrop(null); }} onApply={({ crop }) => { coverCrop.resolve(crop); setCoverCrop(null); }} />}
    {pendingTape && <TapeCropper image={pendingTape.image} onCancel={() => { discardGeneratedMedia([pendingTape.image]).catch(() => {}); setPendingTape(null); }} onConfirm={({ crop, size, ratio }) => {
      const { src, mediaFileId, poster, name, width, height } = pendingTape.image;
      // 사진으로 만든 테이프는 고른 폴더(없으면 첫 폴더 · '내 테이프')에 담고 그 폴더를 연다
      setTapeFolderId(custom.addTape(pendingTape.folderId, { src, mediaFileId, poster, name, imageWidth: width, imageHeight: height, crop, size, pieceRatio: ratio }));
      setPendingTape(null);
    }} />}
    <ConfirmDialog open={Boolean(question)} title={asking.title} message={asking.message}
      confirmLabel="삭제" danger onCancel={() => setQuestion(null)} onConfirm={confirmRemoval} />
  </View>;
}

const s = StyleSheet.create({
  // 카드를 쌓지 않는 대신 화면 전체를 흰 면(surface) 한 장으로 둔다. 옅은 면(surfaceMuted)의 탭 · 도구함이 그 위에서 보인다
  root: { flex: 1, backgroundColor: colors.surface }, content: { flexGrow: 1, paddingBottom: 36 },
  toolBlock: { width: '100%' }, // 폰: '○○ 추가' 버튼을 감싼 칸도 전폭(말풍선 자리를 재려고 감쌌다)
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
  // 스티커 폴더: 서랍 앞면 같은 얕은 타일, 위에 앞 스티커 두 장, 아래 이름 · 개수. 만들기는 제목 줄 버튼으로만 한다(표지 · 속지 · 폰트와 같다)
  folders: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  // 폭 164 = 스티커 두 장(64 + 8 + 64) + 좌우 여백 14씩: 오른쪽 여백이 왼쪽과 같다
  folderTile: { minHeight: 144, justifyContent: 'space-between', gap: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  folderPreviews: { flexDirection: 'row', gap: 8 },
  // 좁은 폰에서 두 장이 칸을 넘지 않게 64 까지 줄어든다
  folderPreview: { flexBasis: 64, flexShrink: 1, maxWidth: 64, aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  folderText: { gap: 3 },
  folderCount: { fontSize: 12, fontWeight: '500', lineHeight: 17, color: colors.textMuted },
  folderThumb: { width: 56, height: 56 },
  // 폴더 안 스티커: 88×88 칸
  pages: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  page: { gap: 6, alignItems: 'center' },
  pageThumb: { borderRadius: 8, borderWidth: 1, borderColor: colors.cardBorder },
  pageNumber: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  stickers: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  sticker: { padding: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  stickerThumb: { width: '100%', height: '100%' },
  // 테이프: 폴더 타일 위쪽에 앞 테이프 두 장(스티커 미리보기 64 자리와 같은 높이), 폴더 안은 흰 카드에 실제 비율 테이프
  tapeStack: { height: 64, justifyContent: 'center', gap: 8 },
  tapes: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  tapeCard: { minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  // 테이프 이름: 나의 표지 · 속지 선반 이름과 같은 14/700 + 연필(터치 32)
  tapeName: { fontSize: 14, fontWeight: '700', color: colors.text },
  tapeNameRow: { minHeight: 32, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 4 },
  tapeNameText: { flexShrink: 1 },
  tapeNameInput: { minHeight: 32, alignSelf: 'stretch', paddingVertical: 0, paddingHorizontal: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.primary, textAlign: 'center' },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  renameInput: { flex: 1, minWidth: 0, height: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, color: colors.text, fontSize: 15, fontWeight: '700', backgroundColor: colors.surface },
  stickerRemove: { position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
