import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { C } from '../constants';
import { styles as s } from '../styles';

const RAIL_WIDTH = { collapsed: 78, expanded: 218 };
const RAIL_PADDING = { collapsed: 15, expanded: 20 };

export default function SideRail({ page, filter, navigate, create, bottomInset, collapsed, onToggle }) {
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

  const item = (id, label, icon, nextFilter) => {
    const selected = id === 'library'
      ? page === 'library' && filter === (nextFilter || 'all')
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
      <Animated.View style={[s.brandRow, { marginBottom: between(18, 25) }]}>
        <Animated.View pointerEvents={collapsed ? 'none' : 'auto'} style={[s.brandSlot, { opacity: labelOpacity }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="내 다이어리" onPress={() => navigate('library', 'all')} style={s.brand}>
            <View style={s.brandMark}><Text style={s.brandMarkText}>D</Text></View>
            <Text numberOfLines={1} style={s.brandText}>DIO</Text>
          </Pressable>
        </Animated.View>
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
      <Pressable accessibilityRole="button" accessibilityLabel="새 다이어리" onPress={create} style={({ pressed }) => [s.railCreate, pressed && s.pressed]}>
        <AppIcon name="add" size={21} color={C.white} />
        <Animated.Text
          numberOfLines={1}
          style={[s.railCreateText, { opacity: labelOpacity, maxWidth: between(0, 90), marginLeft: between(0, 8) }]}
        >
          새 다이어리
        </Animated.Text>
      </Pressable>
      <Animated.View style={[s.railGroup, { marginTop: between(18, 25) }]}>
        <Animated.View style={[s.railSectionSlot, { height: between(0, 23), opacity: labelOpacity }]}>
          <Text numberOfLines={1} style={s.railSection}>보관함</Text>
        </Animated.View>
        {item('library', '모든 다이어리', 'grid', 'all')}
        {item('profile', '내 공간', 'person')}
        {item('library', '즐겨찾기', 'star', 'favorite')}
        {item('trash', '휴지통', 'trash')}
      </Animated.View>
      <View style={s.railBottom}>
        <View accessibilityLabel="다크 모드 준비 중" style={s.railItem}>
          <View style={s.railIconSlot}><AppIcon name="moon" size={20} color={C.muted} /></View>
          <Animated.Text numberOfLines={1} style={[s.railLabel, { opacity: labelOpacity }]}>다크 모드</Animated.Text>
        </View>
      </View>
    </Animated.View>
  );
}
