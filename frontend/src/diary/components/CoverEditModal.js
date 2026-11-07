import { useRef, useState } from 'react';
import { Modal, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MODAL_ORIENTATIONS } from '../../editor/components/controls/EditorModal';
import ConfirmDialog from '../../editor/components/controls/ConfirmDialog';
import { discardGeneratedMedia } from '../../editor/services/mediaStore';
import { colors, shadow } from '../../shared/theme';
import CoverArt from './CoverArt';
import CoverOptions from './CoverOptions';
import Workbench, { fit } from './Workbench';

// 표지는 세로 3:4, 가로 4:3 (새 다이어리와 같다)
const COVER_RATIO = 3 / 4;
// 미리보기의 '다이어리 이름' 자리: 실제 이름은 이 표지로 다이어리를 만들 때 들어간다
const PREVIEW_NAME = '새 다이어리';

const photoIdOf = cover => cover?.photo?.mediaFileId ?? null;

/**
 * 공방 '내 표지' 편집(지라 603). 새 다이어리의 표지 탭과 같은 미리보기 · 옵션(배경 · 고무줄 · 제목 · 라벨 · 스티커)을 그대로 쓰고,
 * 저장하면 꾸밈까지 내 표지에 남는다(사용자 결정 2026-11-07). 새 다이어리에서 이 표지를 고르면 꾸밈도 함께 들어간다.
 * item: { id, name, orientation, cover }  onSave(cover) → 저장 성공 여부(boolean)
 */
// 내 표지는 저장할 때 제목 글자를 비우고 '다이어리 이름 쓰기'도 꺼 둔다(coverForLibrary). 그대로 열면 라벨 · 제목을 켜도 빈 칸이라,
// 제목이 비어 있으면 '다이어리 이름 쓰기'를 켠 채로 시작한다(미리보기는 '새 다이어리', 만들 때는 그 다이어리 이름)
const editableCover = cover => cover?.title && !cover.title.text && !cover.title.useName ? { ...cover, title: { ...cover.title, useName: true } } : cover;

export default function CoverEditModal({ item, compact = false, onSave, onClose }) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const stacked = compact || window.height > window.width;
  const [initial] = useState(() => editableCover(item.cover));
  const [cover, setCover] = useState(initial);
  const [openElement, setOpenElement] = useState('base');
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false), [leaving, setLeaving] = useState(false);
  const busy = useRef(false);
  const changed = cover !== initial;
  const ratio = item.orientation === 'landscape' ? 1 / COVER_RATIO : COVER_RATIO;

  // 편집하다 새로 고른 사진은, 저장하지 않고 닫으면 지운다(처음 표지의 사진은 남긴다)
  const discardFreshPhoto = () => {
    const fresh = photoIdOf(cover);
    if (fresh && fresh !== photoIdOf(item.cover)) discardGeneratedMedia([cover.photo]).catch(() => {});
  };
  const close = () => { discardFreshPhoto(); onClose(); };
  const cancel = () => { if (saving) return; if (changed) setLeaving(true); else onClose(); };
  const save = async () => {
    if (busy.current) return;
    if (!changed) { onClose(); return; }
    busy.current = true; setSaving(true); setError('');
    try {
      const done = await onSave(cover);
      if (done) onClose();
      else setError('표지를 저장하지 못했어요. 다시 시도해 주세요.');
    } finally { busy.current = false; setSaving(false); }
  };

  let preview = null;
  if (stage.width > 0) {
    const size = fit(ratio, stage.width * (stacked ? 0.86 : 0.8), stage.height - (stacked ? 44 : 80));
    preview = <View style={[styles.frame, { width: size.width, height: size.height }]}>
      <CoverArt cover={cover} name={PREVIEW_NAME} width={size.width} height={size.height} shadow={shadow.card}
        edit={saving ? null : { onChange: setCover, onSelectSticker: id => { if (id && id !== 'title') setOpenElement('stickers'); } }} />
    </View>;
  }
  const panel = <CoverOptions cover={cover} name={PREVIEW_NAME} ratio={ratio} onChange={next => { setCover(next); setError(''); }}
    openElement={openElement} onOpenElement={setOpenElement} onNotice={setNotice} />;
  const message = error || notice;
  const foot = message ? <Text accessibilityRole="alert" style={error ? styles.error : styles.notice}>{message}</Text> : null;

  return (
    // 새 다이어리 화면과 같은 창: 상태 바 위까지 그리고 두 방향을 모두 허용한다(iOS 가로 고정 태블릿 종료 방지)
    <Modal visible transparent supportedOrientations={MODAL_ORIENTATIONS} presentationStyle="overFullScreen" animationType="none"
      statusBarTranslucent navigationBarTranslucent onRequestClose={cancel}>
      <StatusBar hidden />
      <View accessibilityViewIsModal style={[styles.dialog, !stacked && { paddingBottom: insets.bottom }]}>
        <Workbench title="표지 편집" actionLabel={saving ? '저장 중' : '저장'} onCancel={cancel} cancelDisabled={saving} onSubmit={save} submitDisabled={saving}
          sections={[]} section="cover" onSection={() => {}} sheet={stacked} roomy={!compact} topInset={compact ? insets.top : 0} bottomInset={insets.bottom}
          onStageLayout={setStage} stage={preview} panel={panel} panelLocked={saving} foot={foot} />
      </View>
      <ConfirmDialog open={leaving} title="저장하지 않고 닫을까요?" message="바꾼 내용은 저장되지 않아요." confirmLabel="닫기"
        onConfirm={() => { setLeaving(false); close(); }} onCancel={() => setLeaving(false)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  dialog: { flex: 1, overflow: 'hidden', backgroundColor: colors.surfaceSoft },
  frame: { borderTopLeftRadius: 6, borderBottomLeftRadius: 6, borderTopRightRadius: 14, borderBottomRightRadius: 14 },
  error: { color: colors.dangerStrong, fontSize: 13, fontWeight: '600' },
  notice: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
});
