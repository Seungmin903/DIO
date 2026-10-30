import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Header from '../components/Header';
import AppIcon from '../../shared/AppIcon';
import { styles as shell } from '../styles';
import { colors, radius, DISABLED_OPACITY } from '../../shared/theme';
import { openFontStudio, studioSnapshot, subscribeStudio } from '../../handwriting/studioBus';
import { refreshPersonalFonts } from '../../handwriting/library';
import { loadedFontFamily } from '../../editor/utils/text';
import { useCustomDecor } from '../../editor/hooks/useCustomDecor';
import { stickerSplit } from '../../editor/services/stickerSplit';
import StickerSplitModal from '../../editor/components/panels/StickerSplitModal';
import StickerCutoutModal from '../../editor/components/panels/StickerCutoutModal';
import StickerThumbImage from '../../editor/components/controls/StickerThumbImage';
import ConfirmDialog from '../../editor/components/controls/ConfirmDialog';
import DecorSaveNotice from '../../editor/components/panels/DecorSaveNotice';

function Button({ label, icon, iconOnly = false, onPress, disabled = false }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, (pressed || disabled) && s.dim]}>
    {icon && <AppIcon name={icon} size={18} />}{!iconOnly && <Text style={s.buttonText}>{label}</Text>}
  </Pressable>;
}

export default function DecorationStudioScreen({ compact = false, registerBackHandler }) {
  const custom = useCustomDecor();
  const studio = useSyncExternalStore(subscribeStudio, studioSnapshot, studioSnapshot);
  const [fonts, setFonts] = useState([]), [fontState, setFontState] = useState('loading');
  const [tool, setTool] = useState(null), [folderId, setFolderId] = useState(null);
  const [question, setQuestion] = useState(null);
  const alive = useRef(false), request = useRef(0);
  const folderRef = useRef(null);
  folderRef.current = folderId;
  useEffect(() => registerBackHandler?.(() => {
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

  const cards = [
    { id: 'font', icon: 'text', title: '내 폰트 만들기', description: '손글씨를 나만의 글꼴로', action: () => openFontStudio() },
    { id: 'split', icon: 'grid', title: '스티커 시트 분리', description: '시트 속 그림을 개별 스티커로', action: () => setTool('split'), disabled: !custom.loaded || !stickerSplit.available,
      notice: !stickerSplit.available ? '개발 빌드에서 사용 가능' : null },
    { id: 'cutout', icon: 'crop', title: '사진 속 대상 오리기', description: '사진 속 원하는 대상만', action: () => setTool('cutout'),
      notice: '미리보기 · AI 분리·저장 미연결' },
  ];
  return <View style={s.root}>
    <ScrollView contentContainerStyle={[shell.screen, compact && shell.screenCompact, s.content]}>
      <Header title="꾸미기 공방" compact={compact} />
      <View style={[s.cards, compact && s.cardsCompact]}>
        {cards.map(card => <Pressable key={card.id} accessibilityRole="button" accessibilityLabel={card.title}
          accessibilityHint={card.notice || card.description} accessibilityState={{ disabled: Boolean(card.disabled) }}
          disabled={card.disabled} onPress={card.action}
          style={({ pressed }) => [s.card, compact && s.cardCompact, pressed && s.dim]}>
          <View style={[s.cardAction, card.disabled && s.dim]}>
            <View style={s.cardTop}><View style={s.cardIcon}><AppIcon name={card.icon} size={32} color={colors.primaryStrong} /></View>
              {!card.disabled && <AppIcon name="chevron-right" size={18} />}</View>
            <View><Text style={s.cardTitle}>{card.title}</Text>
              <Text style={s.description}>{card.description}</Text></View>
          </View>
          {card.notice && <Text style={s.notice}>{card.notice}</Text>}
        </Pressable>)}
      </View>

      <View style={s.sectionHeader}><Text style={s.sectionTitle}>내 폰트</Text>
        <Button label="폰트 관리" onPress={() => openFontStudio()} /></View>
      {fontState === 'loading' ? <Text style={s.empty}>폰트를 불러오고 있어요.</Text>
        : fontState === 'error' ? <View accessibilityRole="alert"><Text style={s.empty}>폰트 목록을 불러오지 못했어요.</Text><Button label="폰트 목록 다시 불러오기" onPress={refreshFonts} /></View>
        : !fonts.length ? <Text style={s.empty}>아직 만든 폰트가 없어요.</Text>
        : fonts.map(font => {
          const family = !font.missing && loadedFontFamily(font.id);
          return <View key={font.id} style={s.listRow}>
            <View style={s.grow}><Text style={s.itemTitle}>{font.label}</Text>
              {family ? <Text accessibilityLabel={font.label + ' 미리보기'} style={[s.fontPreview, { fontFamily: family }]}>나만의 글씨로 남기는 오늘</Text>
                : <Text style={s.description}>폰트를 불러오지 못했어요. 폰트 관리에서 확인해 주세요.</Text>}</View>
          </View>;
        })}

      <View style={s.sectionHeader}><Text style={s.sectionTitle}>내 스티커</Text>
        {folder && <Button label="스티커 폴더 목록" onPress={() => setFolderId(null)} />}</View>
      <DecorSaveNotice error={custom.saveError} pending={custom.savePending} onRetry={custom.retrySave} />
      {!custom.loaded ? <Text style={s.empty}>스티커를 불러오고 있어요.</Text>
        : folder ? <View style={s.folder}>
            <View style={s.sectionHeader}><Text style={[s.itemTitle, s.grow]}>{folder.name}</Text>
              <Button label="스티커 폴더 삭제" icon="trash" onPress={() => setQuestion({ folder })} /></View>
            {!folder.items.length && <Text style={s.empty}>아직 스티커가 없어요.</Text>}
            <View style={s.tiles}>{folder.items.map((item, index) => <View key={item.id || `${item.mediaFileId || item.src}-${index}`} style={s.tile}>
              <StickerThumbImage item={item} style={s.thumb} />
              <Button label={`${index + 1}번 스티커 삭제`} icon="trash" iconOnly onPress={() => setQuestion({ folder, item })} />
            </View>)}</View>
          </View>
        : !custom.items.folders.length ? <Text style={s.empty}>아직 스티커 폴더가 없어요.</Text>
        : custom.items.folders.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name} 스티커 폴더`}
            onPress={() => setFolderId(item.id)} style={({ pressed }) => [s.listRow, pressed && s.dim]}>
            <AppIcon name="folder" size={22} /><View style={s.grow}><Text style={s.itemTitle}>{item.name}</Text><Text style={s.description}>{item.items.length}개 스티커</Text></View>
            <AppIcon name="chevron-right" size={18} />
          </Pressable>)}
    </ScrollView>
    {tool === 'split' && <StickerSplitModal onClose={() => setTool(null)} onSave={async (id, name, stickers) => {
      const cleanName = name.trim();
      await custom.saveGenerated(id, cleanName, stickers);
      setFolderId(null);
    }} />}
    {tool === 'cutout' && <StickerCutoutModal folder={folder} onClose={() => setTool(null)} />}
    <ConfirmDialog open={Boolean(question)} title={question?.item ? '이 스티커를 지울까요?' : '스티커 폴더를 지울까요?'}
      message="편집기 스티커 보관함에서도 사라져요. 다이어리에 이미 붙인 내용은 유지돼요."
      confirmLabel="삭제" danger onCancel={() => setQuestion(null)} onConfirm={() => {
        if (question?.item) custom.removeFromFolder(question.folder.id, question.item);
        else if (question) { custom.removeFolder(question.folder.id); setFolderId(null); }
        setQuestion(null);
      }} />
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1 }, content: { gap: 16 },
  cards: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' }, cardsCompact: { flexDirection: 'column' },
  card: { flexGrow: 1, flexBasis: 210, minWidth: 0, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cardCompact: { flexBasis: 'auto', width: '100%' }, cardAction: { padding: 20, gap: 16, minHeight: 184 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fontPreview: { fontSize: 20, lineHeight: 30, color: colors.text, marginTop: 8 },
  cardIcon: { width: 68, height: 68, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text }, description: { fontSize: 12.5, fontWeight: '600', lineHeight: 19, color: colors.textMuted },
  notice: { fontSize: 12.5, fontWeight: '600', lineHeight: 19, color: colors.textMuted, paddingHorizontal: 16, paddingBottom: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: colors.text }, itemTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 64, borderRadius: radius.md, backgroundColor: colors.surface },
  grow: { flex: 1, minWidth: 0 }, empty: { color: colors.textMuted, fontSize: 12.5, fontWeight: '600', lineHeight: 19, paddingVertical: 16 },
  button: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  buttonText: { color: colors.text, fontSize: 13, fontWeight: '700' }, dim: { opacity: DISABLED_OPACITY },
  folder: { gap: 12 }, tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: 132, padding: 8, backgroundColor: colors.surface, borderRadius: radius.md }, thumb: { width: '100%', height: 100 },
});
