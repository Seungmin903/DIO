import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

// 메뉴 이름은 펼칠 때 옅게 나타난다. 앱 UI 글꼴(Pretendard) 글자를 그대로 움직이도록 직접 만든다(Animated.Text 는 글꼴을 거치지 않는다)
const AnimatedText = Animated.createAnimatedComponent(Text);
import BrandLogo from '../../shared/BrandLogo';
import AppIcon from '../../shared/AppIcon';
import ProfileAvatar from './ProfileAvatar';
import { notificationCountLabel } from '../../notifications/notificationCount.js';
import { C, LIBRARY_SCOPES } from '../constants';
import { filterScope } from '../utils/libraryQuery';
import { markRailMoving } from '../utils/railMotion';
import { styles as s } from '../styles';

export const RAIL_WIDTH = { collapsed: 78, expanded: 218 };
const RAIL_PADDING = { collapsed: 15, expanded: 20 };
// 폰의 좌측 바(코덱스 2026-11-01): 접힘 60(안쪽 8, 항목 44×44) · 펼침 236(안쪽 12). 태블릿과 같은 컴포넌트에 폭 · 여백 · 항목 크기만 다르다.
export const PHONE_RAIL_WIDTH = { collapsed: 60, expanded: 236 };
const PHONE_RAIL_PADDING = { collapsed: 8, expanded: 12 };
const RAIL_MS = 240;

// user · getProfilePhotoSource: 메뉴 맨 아래 '내 공간' 자리에 프로필 그림(접힘)과 닉네임(펼침)을 보인다.
function SideRail({ page, filter, navigate, bottomInset = 0, topInset = 0, compact = false, collapsed, onToggle, onNotifications, invitationCount = 0, notificationLabel = '받은 초대', notificationCount, user = null, getProfilePhotoSource }) {
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

  const widths = compact ? PHONE_RAIL_WIDTH : RAIL_WIDTH;
  const paddings = compact ? PHONE_RAIL_PADDING : RAIL_PADDING;
  const between = (from, to) => progress.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  // 너비가 어느 정도 벌어진 뒤에 글자가 나타나도록 늦게 보인다.
  const scrimOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const labelOpacity = progress.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0, 1] });
  // 삼선 메뉴의 점은 메뉴가 열리기 시작하면 바로 꺼지고, 알림 아이콘의 점은 글자와 함께 나타난다.
  const dotOpacity = progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 0, 0] });
  // 폰: 접힌 폭에도 알림 종이 삼선 아래에 보인다. 펼치면 위 줄(로고 · 종 · 삼선)로 옮겨 가므로 이 종은 접힌 동안만 둔다.
  const collapsedBellOpacity = progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 0, 0] });

  const summary = notificationCount ? notificationCountLabel(notificationCount.data) : null;
  const showDot = summary ? summary.showDot : invitationCount > 0;
  const countDescription = summary ? (summary.value === null ? '' : `, ${summary.label} ${summary.value}개`) : (invitationCount ? `, 새 초대 ${invitationCount}개` : '');
  const needsCheck = notificationCount?.status === 'error' ? ', 알림 수 확인 필요' : '';

  // 고른 메뉴: 라벤더 면 + primaryText 아이콘, 나머지 아이콘은 primary(#818AC3, 바 바탕 위 3.1:1) — 원 페이저 04
  // 접힘은 아이콘 뒤 36×36 타일, 펼치면 같은 면이 줄 오른쪽 끝까지 늘어나 알약이 된다(왼쪽은 아이콘 앞 8, 코덱스 2026-11-01). 메뉴 펼침 값(progress)에 묶어 함께 늘어난다
  const itemPad = compact ? 11 : 12.5; // railItem · railItemPhone 의 안쪽 좌우(아이콘 칸 22의 왼쪽 끝)
  const itemWidth = widths.expanded - 1 - paddings.expanded * 2; // 펼친 메뉴의 항목 폭(오른쪽 선 1 제외)
  const markLeft = between(itemPad - 7, itemPad - 8);
  const markWidth = between(36, itemWidth - (itemPad - 8));
  const item = (id, label, icon, nextFilter, style = null) => {
    const selected = id === 'library'
      ? page === 'library' && filterScope(filter) === nextFilter
      : page === id;
    return (
      <Pressable
        key={label}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={() => navigate(id, nextFilter)}
        style={({ pressed }) => [s.railItem, compact && s.railItemPhone, selected && s.railItemSelected, style, pressed && s.pressed]}
      >
        {selected && <Animated.View pointerEvents="none" style={[s.railIconTile, compact && s.railIconTilePhone, { left: markLeft, width: markWidth }]} />}
        <View style={s.railIconSlot}>
          <AppIcon name={icon} size={20} color={selected ? C.blueText : C.blue} fill={selected && icon === 'star' ? C.blueText : 'none'} />
        </View>
        <AnimatedText numberOfLines={1} style={[s.railLabel, selected && s.railLabelSelected, { opacity: labelOpacity }]}>{label}</AnimatedText>
      </Pressable>
    );
  };

  // 자리(slot)는 접힌 폭의 빈 칸으로 고정하고, 펼친 메뉴는 shell 바로 아래에서 그 위에 겹쳐 늘어난다(부모 영역 밖 터치가 안드로이드에서 막히지 않도록 slot 안에 두지 않는다).
  // 메뉴가 움직여도 오른쪽 작업 영역의 폭은 바뀌지 않아 카드·표지가 프레임마다 다시 배치되지 않는다. 메인 화면은 움직이지도 줄어들지도 않아 오른쪽이 가려지지 않는다.
  return (
    <>
    {/* 펼쳐지면 메인 화면을 어둡게 가리고, 메인 쪽은 누르기·쓸기·스크롤 모두 여기서 막혀 메뉴만 닫힌다. 메뉴(아래 Animated.View)가 이 막 위에 그려진다.
        막은 자리(slot) 안이 아니라 shell 바로 아래 형제로 둔다 — 부모 영역 밖의 터치는 안드로이드에서 전달되지 않기 때문이다. */}
    <Animated.View pointerEvents={collapsed ? 'none' : 'auto'} style={s.railScrim}>
      <Animated.View style={[s.railScrimTint, { opacity: scrimOpacity }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="메뉴 닫기" accessibilityElementsHidden={collapsed} importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'} onPress={onToggle} style={s.railScrimPress} />
      </Animated.View>
    </Animated.View>
    <View style={[s.railSlot, compact && { width: PHONE_RAIL_WIDTH.collapsed }]} />
    <Animated.View style={[s.railOverlay, { width: between(widths.collapsed, widths.expanded) }]}>
    <Animated.View
      style={[
        s.rail,
        s.railInner,
        { paddingHorizontal: between(paddings.collapsed, paddings.expanded), paddingBottom: (compact ? 12 : 24) + bottomInset },
        compact && { paddingTop: 16 + topInset }, // 맨 위 삼선 줄이 본문 제목 줄(위 여백 16 + 높이 44)과 같은 가운데 높이
      ]}
    >
      <Animated.View style={[s.brandRow, compact && s.brandRowPhone]}>
        <Animated.View pointerEvents={collapsed ? 'none' : 'auto'} style={[s.brandSlot, { opacity: labelOpacity }]}>
          <View style={s.brand}>
            <BrandLogo size={32} />
          </View>
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
              style={({ pressed }) => [s.railToggle, compact && s.railTogglePhone, pressed && s.railTogglePressed]}
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
          style={({ pressed }) => [s.railToggle, compact && s.railTogglePhone, pressed && s.railTogglePressed]}
        >
          <AppIcon name="menu" size={compact ? 22 : 24} color={C.ink} />
          {/* 메뉴가 접혀 알림 버튼이 보이지 않을 때만 삼선 메뉴에 점을 둔다. 펼치면 점이 알림 아이콘으로 옮겨 간다. */}
          {showDot && !compact && <Animated.View testID="menu-notification-dot" pointerEvents="none" style={[s.railDot, s.railMenuDot, { opacity: dotOpacity }]} />}
        </Pressable>
      </Animated.View>
      {compact && onNotifications && (
        <Animated.View pointerEvents={collapsed ? 'auto' : 'none'} style={{ height: between(44, 0), marginBottom: between(4, 0), opacity: collapsedBellOpacity, overflow: 'hidden' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${notificationLabel}${countDescription}${needsCheck}`}
            accessibilityElementsHidden={!collapsed}
            importantForAccessibility={collapsed ? 'auto' : 'no-hide-descendants'}
            onPress={onNotifications}
            style={[s.railToggle, s.railTogglePhone]}
          >
            <AppIcon name="bell" size={22} color={C.ink} />
            {showDot && <View testID="collapsed-notification-dot" pointerEvents="none" style={[s.railDot, s.railBellDotPhone]} />}
          </Pressable>
        </Animated.View>
      )}
      <Animated.View style={[s.railGroup, compact && s.railGroupPhone]}>
        {LIBRARY_SCOPES.map(scope => item('library', scope.label, scope.icon, scope.id))}
        {item('studio', '꾸미기 공방', 'workshop')}
      </Animated.View>
      {/* 휴지통은 자주 쓰지 않아 위 묶음에서 떼어 메뉴 아래쪽(내 공간 위)에 따로 둔다 */}
      <View style={s.railSpacer} />
      {item('trash', '휴지통', 'bin', s.railTrash)}
      {/* 내 공간: 메뉴 맨 아래, 위에 구분선 하나. 접으면 프로필 그림, 펼치면 닉네임이 그 옆에 나온다. 고른 상태 바탕은 깔지 않고 글자 굵기로만 보인다 */}
      {/* 구분선은 메뉴 좌우 끝에서 끝까지: 메뉴 안쪽 여백(접힘 15 · 펼침 20)만큼 밖으로 늘린다 */}
      <Animated.View style={[s.railProfileLine, compact && s.railProfileLinePhone, { marginHorizontal: between(-paddings.collapsed, -paddings.expanded) }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="내 공간"
        accessibilityState={{ selected: page === 'profile' }}
        onPress={() => navigate('profile')}
        style={[s.railItem, s.railProfile, compact && s.railItemPhone, compact && s.railProfilePhone]}
      >
        <View style={s.railAvatarSlot}><ProfileAvatar user={user} getSource={getProfilePhotoSource} size={30} /></View>
        <AnimatedText numberOfLines={1} style={[s.railLabel, page === 'profile' && s.railLabelSelected, { opacity: labelOpacity }]}>{user?.nickname || '내 공간'}</AnimatedText>
      </Pressable>
    </Animated.View>
    </Animated.View>
    </>
  );
}

export default memo(SideRail);
