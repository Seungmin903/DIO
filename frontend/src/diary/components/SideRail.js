import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import BrandLogo from '../../shared/BrandLogo';
import AppIcon from '../../shared/AppIcon';
import { notificationCountLabel } from '../../notifications/notificationCount.js';
import { C } from '../constants';
import { markRailMoving } from '../utils/railMotion';
import { styles as s } from '../styles';

export const RAIL_WIDTH = { collapsed: 78, expanded: 218 };
const RAIL_PADDING = { collapsed: 15, expanded: 20 };
const RAIL_MS = 240;

function SideRail({ page, filter, navigate, bottomInset = 0, collapsed, onToggle, onNotifications, invitationCount = 0, notificationLabel = '받은 초대', notificationCount }) {
  // 0 = 접힘, 1 = 펼침. 너비·여백·글자 투명도를 한 값으로 함께 움직인다.
  // 메뉴 폭은 레이아웃 값이라 메인 화면(flex)이 메뉴와 함께 프레임마다 줄고 늘어난다.
  // 보관함 · 휴지통은 요소를 memo 해 두어 이 동안 카드를 다시 그리지 않는다(App.js libraryScreen · trashScreen).
  const progress = useRef(new Animated.Value(collapsed ? 0 : 1)).current;

  const first = useRef(true);
  useEffect(() => {
    if (!first.current) markRailMoving(RAIL_MS + 30);
    first.current = false;
    const ease = { duration: RAIL_MS, easing: Easing.out(Easing.cubic) };
    const run = Animated.timing(progress, { toValue: collapsed ? 0 : 1, useNativeDriver: false, ...ease });
    run.start();
    return () => run.stop();
  }, [collapsed, progress]);

  const between = (from, to) => progress.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  // 너비가 어느 정도 벌어진 뒤에 글자가 나타나도록 늦게 보인다.
  const scrimOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const labelOpacity = progress.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0, 1] });
  // 삼선 메뉴의 점은 메뉴가 열리기 시작하면 바로 꺼지고, 알림 아이콘의 점은 글자와 함께 나타난다.
  const dotOpacity = progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 0, 0] });

  const summary = notificationCount ? notificationCountLabel(notificationCount.data) : null;
  const showDot = summary ? summary.showDot : invitationCount > 0;
  const countDescription = summary ? (summary.value === null ? '' : `, ${summary.label} ${summary.value}개`) : (invitationCount ? `, 새 초대 ${invitationCount}개` : '');
  const needsCheck = notificationCount?.status === 'error' ? ', 알림 수 확인 필요' : '';

  const item = (id, label, icon, nextFilter) => {
    const selected = id === 'library'
      ? page === 'library' && filter === nextFilter
      : page === id;
    return (
      <Pressable
        key={label}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={() => navigate(id, nextFilter)}
        style={({ pressed }) => [s.railItem, selected && s.railItemSelected, pressed && s.pressed]}
      >
        <View style={s.railIconSlot}>
          <AppIcon name={icon} size={20} color={selected ? C.ink : C.muted} fill={selected && icon === 'star' ? C.ink : 'none'} />
        </View>
        <Animated.Text numberOfLines={1} style={[s.railLabel, selected && s.railLabelSelected, { opacity: labelOpacity }]}>{label}</Animated.Text>
      </Pressable>
    );
  };

  // 자리(slot)는 접힌 폭으로 고정하고, 펼친 메뉴는 그 위에 겹쳐 연다. 메뉴가 움직여도 오른쪽 작업 영역의 폭은 바뀌지 않아
  // 카드·표지가 프레임마다 다시 배치되지 않는다. 움직이는 건 메뉴 자신뿐이다.
  // 자리(slot)는 접힌 폭으로 고정하고 메뉴는 그 위에 겹쳐 늘어난다. 메인 화면은 움직이지도 줄어들지도 않아 오른쪽이 가려지지 않는다.
  return (
    <View style={s.railSlot}>
    {/* 펼쳐지면 메인 화면을 어둡게 가리고, 메인 쪽을 누르면 메뉴가 닫힌다. 메뉴(아래 Animated.View)가 이 막 위에 그려진다. */}
    <Animated.View pointerEvents={collapsed ? 'none' : 'auto'} style={[s.railScrim, { opacity: scrimOpacity }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="메뉴 닫기" accessibilityElementsHidden={collapsed} importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'} onPress={onToggle} style={s.railScrimPress} />
    </Animated.View>
    <Animated.View
      style={[
        s.rail,
        s.railOverlay,
        { width: between(RAIL_WIDTH.collapsed, RAIL_WIDTH.expanded), paddingHorizontal: between(RAIL_PADDING.collapsed, RAIL_PADDING.expanded), paddingBottom: 24 + bottomInset },
      ]}
    >
      <Animated.View style={s.brandRow}>
        <Animated.View pointerEvents={collapsed ? 'none' : 'auto'} style={[s.brandSlot, { opacity: labelOpacity }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="내 다이어리" onPress={() => navigate('library', 'all')} style={s.brand}>
            <BrandLogo size={32} />
          </Pressable>
        </Animated.View>
        {/* 알림 종: 삼선 메뉴 왼쪽. 펼친 동안만 보이고(접힌 폭에는 자리도 없다), 접힌 동안은 삼선 메뉴의 점이 대신 알린다. */}
        {onNotifications && (
          <Animated.View pointerEvents={collapsed ? 'none' : 'auto'} style={{ width: between(0, 48), opacity: labelOpacity, overflow: 'hidden' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${notificationLabel}${countDescription}${needsCheck}`}
              accessibilityElementsHidden={collapsed}
              importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}
              onPress={onNotifications}
              style={({ pressed }) => [s.railToggle, pressed && s.railTogglePressed]}
            >
              <AppIcon name="bell" size={22} color={C.ink} />
              {showDot && <View testID="notification-dot" pointerEvents="none" style={[s.railDot, s.railMenuDot]} />}
            </Pressable>
          </Animated.View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
          accessibilityState={{ expanded: !collapsed }}
          onPress={onToggle}
          style={({ pressed }) => [s.railToggle, pressed && s.railTogglePressed]}
        >
          <AppIcon name="menu" size={24} color={C.ink} />
          {/* 메뉴가 접혀 알림 버튼이 보이지 않을 때만 삼선 메뉴에 점을 둔다. 펼치면 점이 알림 아이콘으로 옮겨 간다. */}
          {showDot && <Animated.View testID="menu-notification-dot" pointerEvents="none" style={[s.railDot, s.railMenuDot, { opacity: dotOpacity }]} />}
        </Pressable>
      </Animated.View>
      <Animated.View style={s.railGroup}>
        {item('library', '다이어리', 'book', 'all')}
        {item('studio', '꾸미기 공방', 'workshop')}
        {item('profile', '내 공간', 'person')}
        {item('trash', '휴지통', 'trash')}
      </Animated.View>
    </Animated.View>
    </View>
  );
}

export default memo(SideRail);
