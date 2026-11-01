import { Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';

// 보관함 제목과 같은 높이·크기로 맞춘다. compact: 폰 화면. icon: 제목 왼쪽에 글자(800)와 비슷한 굵기의 선 아이콘.
export default function Header({ title, icon, left, right, compact = false }) {
  return (
    <View style={[s.header, compact && s.headerCompact]}>
      <View style={s.headerTitleRow}>
        {!!left && <View style={{ marginRight: 8 }}>{left}</View>}
        {icon && <AppIcon name={icon} size={compact ? 24 : 27} color={s.headerTitle.color} strokeWidth={2.4} />}
        <Text accessibilityRole="header" style={[s.headerTitle, compact && s.headerTitleCompact]}>{title}</Text>
      </View>
      <View style={s.headerRight}>{right}</View>
    </View>
  );
}
