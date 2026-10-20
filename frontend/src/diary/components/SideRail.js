import { Pressable, Text, View } from 'react-native';
import { styles as s } from '../styles';

export default function SideRail({ page, filter, navigate, create, bottomInset, collapsed, onToggle }) {
  const item = (id, label, icon, nextFilter) => {
    const selected = (id === 'library' && page === 'library' && filter === nextFilter) || page === id;
    return (
      <Pressable
        key={label}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={() => navigate(id, nextFilter)}
        style={({ pressed }) => [s.railItem, collapsed && s.railItemCollapsed, selected && s.railItemSelected, pressed && s.pressed]}
      >
        <Text style={[s.railIcon, selected && s.railIconSelected]}>{icon}</Text>
        {!collapsed && <Text style={[s.railLabel, selected && s.railLabelSelected]}>{label}</Text>}
      </Pressable>
    );
  };

  return (
    <View style={[s.rail, collapsed && s.railCollapsed, { paddingBottom: 24 + bottomInset }]}>
      <View style={[s.brandRow, collapsed && s.brandRowCollapsed]}>
        <Pressable accessibilityRole="button" accessibilityLabel="내 다이어리" onPress={() => navigate('library', 'all')} style={[s.brand, collapsed && s.brandCollapsed]}>
          <View style={s.brandMark}><Text style={s.brandMarkText}>D</Text></View>
          {!collapsed && <Text style={s.brandText}>DIO</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={collapsed ? '보관함 펼치기' : '보관함 접기'} accessibilityState={{ expanded: !collapsed }} onPress={onToggle} style={({ pressed }) => [s.railToggle, pressed && s.pressed]}>
          <Text style={s.railToggleText}>{collapsed ? '›' : '‹'}</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="새 다이어리" onPress={create} style={({ pressed }) => [s.railCreate, collapsed && s.railCreateCollapsed, pressed && s.pressed]}>
        <Text style={s.railPlus}>+</Text>
        {!collapsed && <Text style={s.railCreateText}>새 다이어리</Text>}
      </Pressable>
      <View style={[s.railGroup, collapsed && s.railGroupCollapsed]}>
        {!collapsed && <Text style={s.railSection}>보관함</Text>}
        {item('library', '모든 다이어리', '▦', 'all')}
        {item('library', '개인', '○', 'personal')}
        {item('library', '공유', '♧', 'shared')}
        {item('library', '즐겨찾기', '★', 'favorite')}
        {item('trash', '휴지통', '⌫')}
      </View>
      <View style={s.railBottom}>
        {item('search', '기록 찾기', '⌕')}
        {item('profile', '내 공간', '◌')}
      </View>
    </View>
  );
}
