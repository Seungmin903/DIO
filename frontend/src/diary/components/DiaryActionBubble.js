import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import EditorModal from '../../editor/components/controls/EditorModal';
import { bubble, colors, radius, DISABLED_OPACITY } from '../../shared/theme';

// 말풍선 크기: 폭 224, 행 높이 48(터치 기준), 안쪽 여백 6, 버튼과의 간격 8
const WIDTH = 224, ROW = 48, PAD = 6, GAP = 8, EDGE = 12;
// 카드 안에 가둘 때의 최소 폭('휴지통으로 이동' 한 줄이 들어가는 폭)
const MIN_WIDTH = 160;

/**
 * 말풍선 자리: 제목 줄 오른쪽 끝의 ⋯ 버튼 아래에 버튼 오른쪽 끝을 맞춰 연다(간격 8). 아래에 자리가 없으면 버튼 위, 위도 없으면 화면 안으로 밀어 넣는다.
 * anchor 가 없으면(재지 못함) 화면 가운데.
 * anchor.bounds({ x, width }: 그 카드의 칸)가 있으면 폭을 칸 폭까지(최소 160)로 줄여 칸 안에 가둔다: 폰 2열에서 왼쪽 카드의
 * 말풍선이 화면 끝에 밀려 오른쪽 카드를 덮던 것(웹 조사 · 사용자 결정 2026-11-08). 오른쪽 끝은 그대로 ⋯ 오른쪽 끝에 맞춘다.
 */
export function bubblePlacement(anchor, size, window) {
  const height = PAD * 2 + size * ROW;
  const clampTop = top => Math.max(EDGE, Math.min(top, window.height - EDGE - height));
  if (!anchor) return { left: (window.width - WIDTH) / 2, top: clampTop((window.height - height) / 2), height, width: WIDTH };
  const width = anchor.bounds?.width > 0 ? Math.max(MIN_WIDTH, Math.min(WIDTH, anchor.bounds.width)) : WIDTH;
  const b = anchor.bounds?.width > 0 ? anchor.bounds : null;
  // 칸이 있으면 ⋯ 오른쪽 끝 정렬을 칸 안으로 당긴다(왼쪽 열 카드는 칸 왼쪽 끝에 붙는다)
  const want = anchor.x + anchor.width - width;
  const inCell = b ? Math.min(Math.max(want, b.x), b.x + b.width - width) : want;
  const left = Math.max(EDGE, Math.min(inCell, window.width - EDGE - width));
  const below = anchor.y + anchor.height + GAP, above = anchor.y - GAP - height;
  if (below + height <= window.height - EDGE) return { left, top: below, height, width };
  return { left, top: clampTop(above >= EDGE ? above : below), height, width };
}

/**
 * 제목 줄 오른쪽 끝 `⋯` 버튼을 누르면 버튼 아래에 뜨는 동작 말풍선: 수정 · 휴지통으로 이동.
 * 꼬리 없는 작은 말풍선이다. 바깥을 누르면 닫힌다.
 * anchor: 버튼의 창 안 자리 { x, y, width, height } (재지 못했으면 null, 화면 가운데에 뜬다).
 * actions: [{ id, label(접근성 이름), text, icon, filled, disabled, onPress }]. 휴지통으로 보내기는 30일 안에 되돌릴 수 있어 적색이 아니라 네이비다.
 */
export default function DiaryActionBubble({ anchor, title, actions, onClose, visible = true, onDismiss }) {
  const window = useWindowDimensions();
  // 화면 크기(회전)가 바뀌면 버튼 자리가 달라져 어긋나므로 닫는다
  const size = useRef(`${window.width}x${window.height}`);
  useEffect(() => { if (size.current !== `${window.width}x${window.height}`) onClose(); }, [window.width, window.height]); // eslint-disable-line react-hooks/exhaustive-deps
  const place = bubblePlacement(anchor, actions.length, window);
  return (
    <EditorModal visible={visible} onDismiss={onDismiss} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {/* 바깥을 누르면 닫힌다. 막(scrim)은 깔지 않는다 */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="닫기" />
      <View accessibilityRole="menu" accessibilityLabel={`${title} 동작`} style={[local.bubble, { left: place.left, top: place.top, height: place.height, width: place.width }]}>
        {actions.map((action, index) => (
          <Pressable
            key={action.id}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityState={{ disabled: !!action.disabled }}
            disabled={action.disabled}
            onPress={action.onPress}
            style={({ pressed }) => [local.row, index > 0 && local.rowDivider, action.disabled && { opacity: DISABLED_OPACITY }, pressed && local.pressed]}
          >
            {/* danger: 되돌리기 어려운 동작(내보내기 · 차단하기)은 글자 · 아이콘을 dangerStrong 으로(2026-11-08 지라 686) */}
            <AppIcon name={action.icon} size={20} forText={15} color={action.danger ? colors.dangerStrong : colors.text} fill={action.filled ? colors.text : 'none'} />
            <Text style={[local.rowText, action.danger && { color: colors.dangerStrong }]}>{action.text}</Text>
          </Pressable>
        ))}
      </View>
    </EditorModal>
  );
}

const local = StyleSheet.create({
  bubble: { ...bubble, position: 'absolute', width: WIDTH, padding: PAD },
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: radius.md },
  // 행 사이 가는 선(위 행과 이어지는 면이 눌린 색으로 바뀌어도 선이 보이도록 행 안쪽에 둔다)
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cardBorder, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  rowText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
});
