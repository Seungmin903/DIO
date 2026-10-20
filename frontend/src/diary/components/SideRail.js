import { Pressable, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { C } from '../constants';
import { styles as s } from '../styles';

export default function SideRail({ page, filter, navigate, create, bottomInset, collapsed, onToggle }) {
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
        style={({ pressed }) => [s.railItem, collapsed && s.railItemCollapsed, selected && s.railItemSelected, pressed && s.pressed]}
      >
        <View style={s.railIconSlot}>
          <AppIcon name={icon} size={20} color={selected ? C.ink : C.muted} fill={selected && icon === 'star' ? C.ink : 'none'} />
        </View>
        {!collapsed && <Text style={[s.railLabel, selected && s.railLabelSelected]}>{label}</Text>}
      </Pressable>
    );
  };

  return (
    <View style={[s.rail, collapsed && s.railCollapsed, { paddingBottom: 24 + bottomInset }]}>
      <View style={[s.brandRow, collapsed && s.brandRowCollapsed]}>
        {!collapsed && (
          <Pressable accessibilityRole="button" accessibilityLabel="내 다이어리" onPress={() => navigate('library', 'all')} style={s.brand}>
            <View style={s.brandMark}><Text style={s.brandMarkText}>D</Text></View>
            <Text style={s.brandText}>DIO</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
          accessibilityState={{ expanded: !collapsed }}
          onPress={onToggle}
          style={({ pressed }) => [s.railToggle, pressed && s.railTogglePressed]}
        >
          <AppIcon name="menu" size={24} color={C.ink} />
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="새 다이어리" onPress={create} style={({ pressed }) => [s.railCreate, collapsed && s.railCreateCollapsed, pressed && s.pressed]}>
        <AppIcon name="add" size={21} color={C.white} />
        {!collapsed && <Text style={s.railCreateText}>새 다이어리</Text>}
      </Pressable>
      <View style={[s.railGroup, collapsed && s.railGroupCollapsed]}>
        {!collapsed && <Text style={s.railSection}>보관함</Text>}
        {item('library', '모든 다이어리', 'grid', 'all')}
        {item('profile', '내 공간', 'person')}
        {item('library', '즐겨찾기', 'star', 'favorite')}
        {item('trash', '휴지통', 'trash')}
      </View>
      <View style={s.railBottom}>
        <View accessibilityLabel="다크 모드 준비 중" style={[s.railItem, collapsed && s.railItemCollapsed]}>
          <View style={s.railIconSlot}><AppIcon name="moon" size={20} color={C.muted} /></View>
          {!collapsed && <Text style={s.railLabel}>다크 모드</Text>}
        </View>
      </View>
    </View>
  );
}
