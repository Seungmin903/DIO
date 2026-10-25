import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { styles as s } from '../styles';
import Header from '../components/Header';
import AppInformation from '../components/AppInformation';
import { colors, radius } from '../../shared/theme';

export default function ProfileScreen({ diaries, compact = false, previewUser, onEndPreview }) {
  const favorites = diaries.filter((diary) => diary.favorite).length;

  return (
    <ScrollView contentContainerStyle={[s.screen, compact && s.screenCompact]} showsVerticalScrollIndicator={false}>
      {/* 폰은 영문 보조 제목 없이 한글 제목만 보여 준다. */}
      <Header title="내 공간" compact={compact} />
      <View style={[s.profileHero, compact && s.profileHeroCompact]}>
        <View style={s.profileBadge}>{previewUser?.photoUri?<Image source={{uri:previewUser.photoUri}} accessibilityLabel="프로필 사진" style={{width:60,height:60,borderRadius:21}}/>:<Text style={s.profileBadgeText}>D</Text>}</View>
        <View style={s.profileHeroText}>
          <Text style={s.profileTitle}>{previewUser?.nickname ? `${previewUser.nickname}님의 기록 공간` : '나의 기록 공간'}</Text>
        </View>
      </View>
      <View style={s.stats}>
        <Stat value={diaries.length} label="만든 다이어리" />
        <View style={s.statLine} />
        <Stat value={favorites} label="즐겨찾기" />
      </View>
      {onEndPreview && <Pressable accessibilityRole="button" accessibilityLabel="로그아웃" onPress={onEndPreview} style={local.logoutButton}><Text style={local.logoutText}>로그아웃</Text></Pressable>}
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

const local = StyleSheet.create({
  logoutButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 16 },
  logoutText: { fontSize: 14, fontWeight: '800', color: colors.text },
});
