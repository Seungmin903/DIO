import { Text, View } from 'react-native';
import { styles as s } from '../styles';

export default function Header({ title, eyebrow, right }) {
  return (
    <View style={s.header}>
      <View>
        <Text style={s.eyebrow}>{eyebrow}</Text>
        <Text style={s.headerTitle}>{title}</Text>
      </View>
      <View style={s.headerRight}>{right}</View>
    </View>
  );
}
