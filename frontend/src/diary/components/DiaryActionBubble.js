import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import EditorModal from '../../editor/components/controls/EditorModal';
import { bubble, colors, radius, DISABLED_OPACITY } from '../../shared/theme';

// 말풍선 크기: 폭 224, 행 높이 48(터치 기준), 안쪽 여백 6, 버튼과의 간격 8
const WIDTH = 224, ROW = 48, PAD = 6, GAP = 8, EDGE = 12;

// ⋯ 버튼이 표지 모서리에서 떨어진 만큼(styles.cardMore 의 right 11 · top 12). 버튼 자리에서 표지의 오른쪽 · 위쪽 가장자리를 알아낸다.
const BUTTON_INSET_X = 11, BUTTON_INSET_Y = 12;

/**
 * 말풍선 자리: 표지를 가리지 않게 표지 바깥에 둔다. ① 표지 오른쪽(위쪽 모서리에 맞춤) ② 표지 위쪽(오른쪽 끝에 맞춤) ③ 자리가 없으면 버튼 아래(표지 위로 겹침).
 * 표지 가장자리는 버튼 자리에서 구한다(버튼은 표지 오른쪽 위 모서리 안쪽에 있다).
 */
export function bubblePlacement(anchor, size, window) {
  const height = PAD * 2 + size * ROW;
  const clampTop = top => Math.max(EDGE, Math.min(top, window.height - EDGE - height));
  if (!anchor) return { left: (window.width - WIDTH) / 2, top: clampTop((window.height - height) / 2), height, outside: false };
  const coverRight = anchor.x + anchor.width + BUTTON_INSET_X, coverTop = anchor.y - BUTTON_INSET_Y;
  if (coverRight + GAP + WIDTH <= window.width - EDGE) return { left: coverRight + GAP, top: clampTop(coverTop), height, outside: true };
  const above = coverTop - GAP - height;
  if (above >= EDGE) return { left: Math.max(EDGE, Math.min(coverRight - WIDTH, window.width - EDGE - WIDTH)), top: above, height, outside: true };
  const left = Math.max(EDGE, Math.min(anchor.x + anchor.width - WIDTH, window.width - EDGE - WIDTH));
  return { left, top: clampTop(anchor.y + anchor.height + GAP), height, outside: false };
}

/**
 * 표지 오른쪽 위 `⋯` 버튼을 누르면 버튼 옆에 뜨는 동작 말풍선: 즐겨찾기 · 수정 · 휴지통으로 이동.
 * 꼬리 없는 작은 말풍선을 표지 바깥(오른쪽 → 위쪽 순)에 띄워 표지를 가리지 않는다. 바깥을 누르면 닫힌다.
 * anchor: 버튼의 창 안 자리 { x, y, width, height } (재지 못했으면 null, 화면 가운데에 뜬다).
 * actions: [{ id, label(접근성 이름), text, icon, filled, disabled, onPress }]. 휴지통으로 보내기는 30일 안에 되돌릴 수 있어 적색이 아니라 네이비다.
 */
export default function DiaryActionBubble({ anchor, title, actions, onClose }) {
  const window = useWindowDimensions();
  // 화면 크기(회전)가 바뀌면 버튼 자리가 달라져 어긋나므로 닫는다
  const size = useRef(`${window.width}x${window.height}`);
  useEffect(() => { if (size.current !== `${window.width}x${window.height}`) onClose(); }, [window.width, window.height]); // eslint-disable-line react-hooks/exhaustive-deps
  const place = bubblePlacement(anchor, actions.length, window);
  return (
    <EditorModal transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* 바깥을 누르면 닫힌다. 막(scrim)은 깔지 않는다 */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="닫기" />
      <View accessibilityRole="menu" accessibilityLabel={`${title} 동작`} style={[local.bubble, { left: place.left, top: place.top, height: place.height }]}>
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
            <AppIcon name={action.icon} size={20} color={colors.text} fill={action.filled ? colors.text : 'none'} />
            <Text style={local.rowText}>{action.text}</Text>
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
