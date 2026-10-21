import { ScrollView, Text, View } from 'react-native';
import { styles as s } from '../styles';
import Header from '../components/Header';
import AppInformation from '../components/AppInformation';

export default function ProfileScreen({ diaries, compact = false }) {
  const favorites = diaries.filter((diary) => diary.favorite).length;

  return (
    <ScrollView contentContainerStyle={[s.screen, compact && s.screenCompact]} showsVerticalScrollIndicator={false}>
      {/* 폰은 영문 보조 제목 없이 한글 제목만 보여 준다. */}
      <Header eyebrow={compact ? null : 'MY SPACE'} title="내 공간" compact={compact} />
      <View style={[s.profileHero, compact && s.profileHeroCompact]}>
        <View style={s.profileBadge}><Text style={s.profileBadgeText}>D</Text></View>
        <View style={s.profileHeroText}>
          <Text style={s.profileTitle}>나의 기록 공간</Text>
        </View>
      </View>
      <View style={s.stats}>
        <Stat value={diaries.length} label="만든 다이어리" />
        <View style={s.statLine} />
        <Stat value={favorites} label="즐겨찾기" />
      </View>
      <AppInformation />
    </ScrollView>
  );
}

function Stat({ value, label }) {
  return (
    <View style={s.stat}>
      <Text style={s.statNumber}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}
