import { memo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';
import { formatUpdatedAt } from '../utils/diaryLibrary';

const ACTION_WIDTH = 74;
const OPEN_X = -ACTION_WIDTH * 2;

// 폰 휴지통의 한 줄. 왼쪽으로 쓸면(또는 누르면) 복원·삭제 버튼이 드러난다.
function TrashSwipeRow({ diary, onRestore, onDelete }) {
  const x = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);
  const [open, setOpen] = useState(false);

  const settle = (next) => {
    openRef.current = next;
    setOpen(next);
    Animated.spring(x, { toValue: next ? OPEN_X : 0, speed: 18, bounciness: 0, useNativeDriver: true }).start();
  };

  // 가로로 확실히 움직일 때만 가져가서 목록 세로 스크롤과 다투지 않게 한다.
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => x.setValue(Math.min(0, Math.max(OPEN_X - 24, (openRef.current ? OPEN_X : 0) + g.dx))),
    onPanResponderRelease: (_, g) => settle((openRef.current ? OPEN_X : 0) + g.dx < OPEN_X / 2 || g.vx < -0.5),
    onPanResponderTerminate: () => settle(openRef.current),
  })).current;

  const restore = () => { settle(false); onRestore(diary.id); };
  const remove = () => { settle(false); onDelete(diary); };

  return (
    <View style={s.trashRow}>
      <View
        style={s.trashRowActions}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      >
        <Pressable accessibilityRole="button" accessibilityLabel={`${diary.title} 복원`} onPress={restore} style={({ pressed }) => [s.trashRowAction, s.trashRowRestore, pressed && s.pressed]}>
          <Text style={s.trashRowActionText}>복원</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${diary.title} 영구 삭제`} onPress={remove} style={({ pressed }) => [s.trashRowAction, s.trashRowDelete, pressed && s.pressed]}>
          <Text style={s.trashRowActionText}>삭제</Text>
        </Pressable>
      </View>
      <Animated.View style={[s.trashRowFront, { transform: [{ translateX: x }] }]} {...pan.panHandlers}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${diary.title}, 삭제 ${formatUpdatedAt(diary.trashedAt)}`}
          accessibilityHint={open ? '복원·삭제 버튼을 닫아요.' : '복원·삭제 버튼을 열어요.'}
          accessibilityActions={[{ name: 'restore', label: '복원' }, { name: 'delete', label: '영구 삭제' }]}
          onAccessibilityAction={({ nativeEvent }) => (nativeEvent.actionName === 'restore' ? restore() : remove())}
          onPress={() => settle(!open)}
          style={s.trashRowMain}
        >
          <View style={[s.trashSwatch, { backgroundColor: diary.color }]} />
          <View style={s.trashRowInfo}>
            <Text numberOfLines={1} style={s.trashRowTitle}>{diary.title}</Text>
            <Text style={s.trashRowDate}>삭제 {formatUpdatedAt(diary.trashedAt)}</Text>
          </View>
          <AppIcon name="chevron-left" size={20} color="#A3AFC5" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default memo(TrashSwipeRow);
