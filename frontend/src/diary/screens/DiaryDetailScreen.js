import { Pressable, ScrollView, Text, View } from 'react-native';
import { styles as s } from '../styles';
import Cover from '../components/Cover';
import IconButton from '../components/IconButton';

export default function DiaryDetailScreen({ diary, onBack, onEditCover, onFavorite, onOpenEditor }) {
  return (
    <ScrollView contentContainerStyle={s.detailScreen} showsVerticalScrollIndicator={false}>
      <View style={s.detailTop}>
        <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [s.back, pressed && s.pressed]}>
          <Text style={s.backArrow}>‹</Text>
          <Text style={s.backText}>보관함</Text>
        </Pressable>
        <View style={s.detailActions}>
          <Pressable accessibilityRole="button" onPress={onEditCover} style={({ pressed }) => [s.ghost, pressed && s.pressed]}>
            <Text style={s.ghostText}>표지 수정</Text>
          </Pressable>
          <IconButton
            label={diary.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
            icon={diary.favorite ? '★' : '☆'}
            selected={diary.favorite}
            onPress={onFavorite}
          />
        </View>
      </View>

      <View style={s.detailHero}>
        <View style={s.detailCover}><Cover diary={diary} preview /></View>
        <View style={s.detailInfo}>
          <Text style={s.detailEyebrow}>{diary.type === '공유' ? 'SHARED DIARY' : 'PERSONAL DIARY'}</Text>
          <Text style={s.detailTitle}>{diary.title}</Text>
          <Text style={s.detailCopy}>{diary.type === '공유' ? '함께 남기는 기록을 시작해 보세요.' : '나만의 순간을 페이지에 차곡차곡 남겨 보세요.'}</Text>
          <View style={s.metaRow}>
            <Text style={s.meta}>마지막 수정 {diary.updatedAt}</Text>
            <View style={s.dot} />
            <Text style={s.meta}>0 페이지</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onOpenEditor} style={({ pressed }) => [s.primary, s.detailPrimary, pressed && s.pressed]}>
            <Text style={s.primaryText}>다이어리 열기</Text>
            <Text style={s.primaryArrow}>→</Text>
          </Pressable>
        </View>
      </View>

      <View style={s.detailBottom}>
        <View style={s.detailMessage}>
          <Text style={s.detailMessageKicker}>PAGES</Text>
          <Text style={s.detailMessageTitle}>첫 페이지를 시작해 보세요</Text>
          <Text style={s.detailMessageCopy}>사진, 스티커, 텍스트를 더해 나만의 한 장을 꾸밀 수 있어요.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onOpenEditor} style={({ pressed }) => [s.blankPage, pressed && s.pressed]}>
          <Text style={s.blankPlus}>+</Text>
          <Text style={s.blankText}>새 페이지 열기</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
