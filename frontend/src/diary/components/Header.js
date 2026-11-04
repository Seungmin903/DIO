import { Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';
import PhoneBell from './PhoneBell';

// 보관함 제목과 같은 높이·크기로 맞춘다. compact: 폰 화면. icon: 제목 왼쪽에 글자(800)와 비슷한 굵기의 선 아이콘.
export default function Header({ title, icon, left, right, compact = false }) {
  return (
    <View style={[s.header, compact && s.headerCompact]}>
      <View style={[s.headerTitleRow, compact && s.headerTitleRowCompact]}>
        {!!left && <View style={{ marginRight: 8 }}>{left}</View>}
        {icon && <AppIcon name={icon} size={compact ? 24 : 27} color={s.headerTitle.color} strokeWidth={2.4} />}
        {/* 폰: 오른쪽 버튼 자리가 제목 길이에 따라 바뀌지 않도록 제목이 한 줄에서 줄어든다 */}
        <Text accessibilityRole="header" numberOfLines={compact ? 1 : undefined} adjustsFontSizeToFit={compact} minimumFontScale={0.75} style={[s.headerTitle, compact && s.headerTitleCompact]}>{title}</Text>
      </View>
      <View style={[s.headerRight, compact && s.headerRightCompact]}>{right}{compact && <PhoneBell />}</View>
    </View>
  );
}
