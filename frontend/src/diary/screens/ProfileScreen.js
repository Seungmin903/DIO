import { ScrollView, Text, View } from 'react-native';
import { styles as s } from '../styles';
import Header from '../components/Header';

export default function ProfileScreen({ diaries }) {
  const favorites = diaries.filter((diary) => diary.favorite).length;
  const shared = diaries.filter((diary) => diary.type === '공유').length;

  return (
    <ScrollView contentContainerStyle={s.screen} showsVerticalScrollIndicator={false}>
      <Header eyebrow="MY SPACE" title="내 공간" />
      <View style={s.profileHero}>
        <View style={s.profileBadge}><Text style={s.profileBadgeText}>D</Text></View>
        <View>
          <Text style={s.profileTitle}>나의 기록 공간</Text>
          <Text style={s.profileCopy}>하루의 장면을 다이어리에 남겨 보세요.</Text>
        </View>
      </View>
      <View style={s.stats}>
        <Stat value={diaries.length} label="만든 다이어리" />
        <View style={s.statLine} />
        <Stat value={favorites} label="즐겨찾기" />
        <View style={s.statLine} />
        <Stat value={shared} label="공유 다이어리" />
      </View>
      <View style={s.tip}>
        <Text style={s.tipKicker}>TIP</Text>
        <Text style={s.tipTitle}>공유 초대는 다이어리 상세 화면에서 준비됩니다.</Text>
        <Text style={s.tipCopy}>지금은 개인 다이어리를 만들고 표지부터 시작할 수 있어요.</Text>
      </View>
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
