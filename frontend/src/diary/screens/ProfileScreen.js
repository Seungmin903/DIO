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
          <Text style={s.profileCopy}>하루의 장면을 다이어리에 남겨 보세요.</Text>
        </View>
      </View>
      <View style={s.stats}>
        <Stat value={diaries.length} label="만든 다이어리" />
        <View style={s.statLine} />
        <Stat value={favorites} label="즐겨찾기" />
      </View>
      <View style={s.tip}>
        {!compact && <Text style={s.tipKicker}>TIP</Text>}
        <Text style={[s.tipTitle, compact && s.tipTitleCompact]}>표지 색상으로 다이어리를 구분해 보세요.</Text>
        <Text style={s.tipCopy}>자주 여는 다이어리는 즐겨찾기에 추가할 수 있어요.</Text>
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
