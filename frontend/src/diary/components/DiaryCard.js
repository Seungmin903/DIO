import { Pressable, Text, View } from 'react-native';
import { styles as s } from '../styles';
import { formatUpdatedAt } from '../utils/diaryLibrary';
import Cover from './Cover';

export default function DiaryCard({ diary, layout = 'grid', onOpen, onFavorite, carouselActive = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${diary.title} 열기`}
      onPress={onOpen}
      style={({ pressed }) => [
        s.card,
        layout === 'list' ? s.cardList : layout === 'carousel' ? s.cardCarousel : s.cardGrid,
        layout === 'carousel' && (carouselActive ? s.cardCarouselActive : s.cardCarouselInactive),
        pressed && s.pressed,
      ]}
    >
      <Cover diary={diary} small={layout === 'list'} carousel={layout === 'carousel'} />
      <View style={[s.cardInfo, layout === 'list' && s.cardInfoList, layout === 'carousel' && s.cardInfoCarousel]}>
        <View style={s.cardHeading}>
          <View style={s.cardTitleWrap}>
            <Text numberOfLines={1} style={s.cardTitle}>{diary.title}</Text>
            <Text style={s.cardType}>{diary.type === '공유' ? '함께 쓰는 다이어리' : '나만의 다이어리'}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={diary.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
            hitSlop={10}
            onPress={(event) => { event.stopPropagation(); onFavorite(); }}
            style={({ pressed }) => [s.favorite, pressed && s.pressed]}
          >
            <Text style={[s.favoriteIcon, diary.favorite && s.favoriteOn]}>{diary.favorite ? '★' : '☆'}</Text>
          </Pressable>
        </View>
        <Text style={s.cardDate}>{formatUpdatedAt(diary.updatedAt)}</Text>
      </View>
    </Pressable>
  );
}
