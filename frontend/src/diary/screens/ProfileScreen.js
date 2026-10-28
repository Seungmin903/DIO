import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { styles as s } from '../styles';
import Header from '../components/Header';
import AppInformation from '../components/AppInformation';
import { colors, radius } from '../../shared/theme';
import AppIcon from '../../shared/AppIcon';
import ProfileEditScreen from '../../auth/ProfileEditScreen';

export default function ProfileScreen({ diaries, compact = false, previewUser, onEndPreview, onUpdatePreview, registerLeaveGuard }) {
  const [editing, setEditing] = useState(false);
  const favorites = diaries.filter(diary => diary.favorite).length;
  const guest = previewUser?.provider === 'guest';
  if (editing) return <ProfileEditScreen compact={compact} user={previewUser} onClose={() => setEditing(false)} onUpdate={onUpdatePreview} onEndSession={onEndPreview} registerLeaveGuard={registerLeaveGuard} />;

  const profileAction = guest && onEndPreview ? (
    <Pressable accessibilityRole="button" accessibilityLabel="로그인·회원가입" onPress={onEndPreview} style={({ pressed }) => [local.profileAction, local.guestAction, pressed && local.pressed]}>
      <Text style={local.guestActionText}>로그인·회원가입</Text>
    </Pressable>
  ) : !guest && previewUser?.accountId ? (
    <Pressable accessibilityRole="button" accessibilityLabel="회원정보 수정" onPress={() => setEditing(true)} style={({ pressed }) => [local.profileAction, pressed && local.pressed]}>
      <Text style={local.profileActionText}>프로필 수정</Text>
      <AppIcon name="chevron-right" size={16} color={colors.surface} />
    </Pressable>
  ) : null;

  return (
    <ScrollView contentContainerStyle={[s.screen, compact && s.screenCompact]} showsVerticalScrollIndicator={false}>
      <Header title="내 공간" compact={compact} />
      <View style={[s.profileHero, compact && s.profileHeroCompact]}>
        <View style={s.profileBadge}>
          {previewUser?.photoUri ? <Image source={{ uri: previewUser.photoUri }} accessibilityLabel="프로필 사진" style={local.photo} /> : <Text style={s.profileBadgeText}>D</Text>}
        </View>
        <View style={s.profileHeroText}>
          <Text style={s.profileTitle}>{previewUser?.nickname ? `${previewUser.nickname}님의 기록 공간` : '나의 기록 공간'}</Text>
          {compact && profileAction}
        </View>
        {!compact && profileAction}
      </View>
      <View style={s.stats}>
        <Stat value={diaries.length} label="만든 다이어리" />
        <View style={s.statLine} />
        <Stat value={favorites} label="즐겨찾기" />
      </View>
      <AppInformation />
      {!guest && onEndPreview && <Pressable accessibilityRole="button" accessibilityLabel="로그아웃" onPress={onEndPreview} style={({ pressed }) => [local.logoutButton, pressed && local.pressed]}><Text style={local.logoutText}>로그아웃</Text></Pressable>}
    </ScrollView>
  );
}
function Stat({ value, label }) {
  return <View style={s.stat}><Text style={s.statNumber}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>;
}
const local = StyleSheet.create({
  photo: { width: 60, height: 60, borderRadius: 21 },
  profileAction: { minHeight: 44, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 8, flexShrink: 0 },
  profileActionText: { fontSize: 13, fontWeight: '700', color: colors.surface },
  guestAction: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, marginTop: 6 },
  guestActionText: { fontSize: 13, fontWeight: '700', color: colors.text },
  logoutButton: { minHeight: 48, width: '100%', marginTop: 20, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  logoutText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
