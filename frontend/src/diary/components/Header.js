import { Text, View } from 'react-native';
import { styles as s } from '../styles';

// 보관함 제목과 같은 높이·크기로 맞춘다. compact: 폰 화면.
export default function Header({ title, left, right, compact = false }) {
  return (
    <View style={[s.header, compact && s.headerCompact]}>
      <View style={s.headerStart}>
        {!!left && <View style={s.headerLeft}>{left}</View>}
        <Text style={[s.headerTitle, compact && s.headerTitleCompact]}>{title}</Text>
      </View>
      <View style={s.headerRight}>{right}</View>
    </View>
  );
}
