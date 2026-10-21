import { Text, View } from 'react-native';
import { styles as s } from '../styles';

// compact: 폰 화면. 보관함 제목과 같은 높이·크기로 맞춘다.
export default function Header({ title, eyebrow, right, compact = false }) {
  return (
    <View style={[s.header, compact && s.headerCompact]}>
      <View>
        {eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}
        <Text style={[s.headerTitle, compact && s.headerTitleCompact]}>{title}</Text>
      </View>
      <View style={s.headerRight}>{right}</View>
    </View>
  );
}
