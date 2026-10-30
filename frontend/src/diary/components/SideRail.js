import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import AppIcon from '../../shared/AppIcon';
import SharingEntry from '../../sharing/SharingEntry';
import { C } from '../constants';
import { styles as s } from '../styles';

export const RAIL_WIDTH = { collapsed: 78, expanded: 218 };
const RAIL_PADDING = { collapsed: 15, expanded: 20 };

function SideRail({ page, filter, navigate, bottomInset = 0, collapsed, onToggle, onNotifications, invitationCount = 0, notificationLabel = '받은 초대', notificationCount, profilePhotoSource }) {
  // 0 = 접힘, 1 = 펼침. 너비·여백·글자 투명도를 한 값으로 함께 움직인다.
  const progress = useRef(new Animated.Value(collapsed ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: collapsed ? 0 : 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [collapsed, progress]);

  const between = (from, to) => progress.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  // 너비가 어느 정도 벌어진 뒤에 글자가 나타나도록 늦게 보인다.
  const labelOpacity = progress.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0, 1] });
  const profileSelected = page === 'profile';
  const profileButton = () => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="마이페이지"
      accessibilityState={{ selected: profileSelected }}
      onPress={() => navigate('profile')}
      style={({ pressed }) => [
        s.railProfileButton,
        profileSelected && s.railProfileSelected,
        pressed && s.railTogglePressed,
      ]}
    >
      {profilePhotoSource ? (
        <Image source={profilePhotoSource} style={s.railHeaderAvatar} contentFit="cover" cachePolicy="memory" />
      ) : (
        <View style={s.railHeaderAvatar}>
          <AppIcon name="person" size={20} color={C.muted} />
        </View>
      )}
    </Pressable>
  );
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

  return (
    <Animated.View
      style={[
        s.rail,
        { width: between(RAIL_WIDTH.collapsed, RAIL_WIDTH.expanded), paddingHorizontal: between(RAIL_PADDING.collapsed, RAIL_PADDING.expanded), paddingBottom: 24 + bottomInset },
      ]}
    >
      <Animated.View style={[s.brandRow, { marginBottom: 18 }]}>
        <View style={s.brandSlot} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
          accessibilityState={{ expanded: !collapsed }}
          onPress={onToggle}
          style={({ pressed }) => [s.railToggle, pressed && s.railTogglePressed]}
        >
          <AppIcon name="menu" size={24} color={C.ink} />
        </Pressable>
      </Animated.View>
      <Animated.View style={[s.railProfileFloating, {
        top: between(52, 0),
        left: between(15, 20),
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
      }]}>
        {profileButton()}
      </Animated.View>
      <Animated.View style={[s.railGroup, { marginTop: 18 }]}>
        <Animated.View style={[s.railSectionSlot, { height: 23, opacity: labelOpacity }]}>
          <Text numberOfLines={1} style={s.railSection}>보관함</Text>
        </Animated.View>
        {item('library', '모든 다이어리', 'book', 'personal')}
        {item('library', '즐겨찾기', 'star', 'favorite')}
        {item('trash', '휴지통', 'trash')}
        {onNotifications && <View style={{ alignItems: 'center', marginTop: 8 }}><SharingEntry notifications notificationCount={notificationCount} notificationLabel={notificationLabel} compact={collapsed} count={invitationCount} onPress={onNotifications}/></View>}
      </Animated.View>
    </Animated.View>
  );
}

export default memo(SideRail);
