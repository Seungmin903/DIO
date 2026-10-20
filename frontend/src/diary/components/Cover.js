import { Text, View } from 'react-native';
import { styles as s } from '../styles';

export default function Cover({ diary, small = false, preview = false, carousel = false }) {
  return (
    <View style={[s.cover, small && s.coverSmall, preview && s.coverPreview, carousel && s.coverCarousel, { backgroundColor: diary.color }]}>
      <View style={s.coverLine} />
      <View style={s.coverRing} />
      <Text style={[s.coverKicker, small && s.coverKickerSmall]}>DIO DIARY</Text>
      <Text numberOfLines={2} style={[s.coverTitle, small && s.coverTitleSmall]}>{diary.title}</Text>
      <View style={s.coverFooter}>
        <View style={s.coverRule} />
        <Text style={[s.coverYear, small && s.coverYearSmall]}>2026</Text>
      </View>
    </View>
  );
}
