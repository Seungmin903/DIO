import { Animated, Pressable, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';
import { formatUpdatedAt } from '../utils/diaryLibrary';
import Cover from './Cover';

export default function DiaryCard({ diary, layout = 'grid', onOpen, onFavorite, onEdit, carouselActive = false, animatedStyle }) {
  const card = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${diary.title} 열기`}
      accessibilityState={layout === 'carousel' ? { selected: carouselActive } : undefined}
      onPress={onOpen}
      style={({ pressed }) => [
        s.card,
        layout === 'list' ? s.cardList : layout === 'carousel' ? s.cardCarousel : s.cardGrid,
        pressed && s.pressed,
      ]}
    >
      <View style={s.cardCoverWrap}>
        <Cover diary={diary} small={layout === 'list'} carousel={layout === 'carousel'} grid={layout === 'grid'} />
        <View style={s.cardActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${diary.title} 수정`}
            hitSlop={6}
            onPress={(event) => { event.stopPropagation(); onEdit?.(); }}
            style={({ pressed }) => [s.cardAction, pressed && s.pressed]}
          >
            <AppIcon name="edit" size={17} color="#0B1957" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={diary.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
            hitSlop={6}
            onPress={(event) => { event.stopPropagation(); onFavorite(); }}
            style={({ pressed }) => [s.cardAction, pressed && s.pressed]}
          >
            <AppIcon name="star" size={18} color={diary.favorite ? '#E8AF45' : '#40517D'} fill={diary.favorite ? '#E8AF45' : 'none'} />
          </Pressable>
        </View>
      </View>
      <View style={[s.cardInfo, layout === 'list' && s.cardInfoList, layout === 'carousel' && s.cardInfoCarousel, layout === 'grid' && s.cardInfoGrid]}>
        <View style={s.cardHeading}>
          <View style={s.cardTitleWrap}>
            <Text numberOfLines={1} style={s.cardTitle}>{diary.title}</Text>
            <Text style={s.cardType}>나만의 다이어리</Text>
          </View>
        </View>
        <Text style={s.cardDate}>{formatUpdatedAt(diary.updatedAt)}</Text>
      </View>
    </Pressable>
  );

  return layout === 'carousel' ? <Animated.View style={animatedStyle}>{card}</Animated.View> : card;
}
