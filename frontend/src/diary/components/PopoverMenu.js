import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import EditorModal from '../../editor/components/controls/EditorModal';

const EDGE = 12, GAP = 8;

/**
 * 버튼 옆에 뜨는 작은 메뉴(말풍선). 투명한 바탕이 화면 전체를 덮어 **다른 곳을 누르거나 · 뒤로 가기를 누르거나 · 화면 크기(회전)가 바뀌면 닫힌다.**
 * anchor: 버튼의 창 안 자리 { x, y, width, height }(없으면 위쪽 가운데). 버튼 아래 오른쪽 끝에 맞춰 먼저 띄우고, 아래가 모자라면 위로 뒤집는다.
 * height: 메뉴 높이 어림(위로 뒤집을지 가르는 데만 쓴다). style: 메뉴 면 스타일(폭 · 배경 · 테두리).
 */
export default function PopoverMenu({ open, anchor = null, width = 230, height = 200, label, style, onClose, children }) {
  const window = useWindowDimensions();
  const first = useRef(`${window.width}x${window.height}`);
  // 열려 있는 동안 화면 크기가 바뀌면(기기 회전 · 창 크기) 버튼 자리가 달라져 어긋나므로 닫는다
  useEffect(() => {
    if (open && first.current !== `${window.width}x${window.height}`) onClose();
    first.current = `${window.width}x${window.height}`;
  }, [open, window.width, window.height]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const left = Math.max(EDGE, Math.min(anchor ? anchor.x + anchor.width - width : window.width - width - EDGE, window.width - width - EDGE));
  const below = anchor ? anchor.y + anchor.height + GAP : 96;
  const top = anchor && below + height > window.height - EDGE ? Math.max(EDGE, anchor.y - GAP - height) : below;
  return (
    <EditorModal transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="닫기" />
      <View accessibilityLabel={label} style={[style, { position: 'absolute', left, top, right: undefined, width, zIndex: undefined }]}>{children}</View>
    </EditorModal>
  );
}
