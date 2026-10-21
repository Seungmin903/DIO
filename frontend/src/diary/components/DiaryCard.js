import { memo } from 'react';
import { C } from '../constants';
import { Animated, Pressable, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';
import { formatUpdatedAt } from '../utils/diaryLibrary';
import Cover from './Cover';

// onOpen·onFavorite·onEdit·onDelete는 다이어리를 인자로 받는 공용 콜백이다.
function DiaryCard({ diary, layout = 'grid', compact = false, onOpen, onFavorite, onEdit, onDelete, carouselActive = false, animatedStyle }) {
  const card = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${diary.title} 열기`}
      accessibilityState={layout === 'carousel' ? { selected: carouselActive } : undefined}
      onPress={() => onOpen(diary)}
      style={({ pressed }) => [
        s.card,
        layout === 'list' ? s.cardList : layout === 'carousel' ? s.cardCarousel : s.cardGrid,
        compact && layout === 'carousel' && s.cardCarouselCompact,
        compact && layout === 'grid' && s.cardGridCompact,
        pressed && s.pressed,
      ]}
    >
      <View style={s.cardCoverWrap}>
        <Cover diary={diary} small={layout === 'list'} carousel={layout === 'carousel'} grid={layout === 'grid'} compact={compact} />
        <View style={s.cardActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${diary.title} 수정`}
            hitSlop={6}
            onPress={(event) => { event.stopPropagation(); onEdit?.(diary); }}
            style={({ pressed }) => [s.cardAction, pressed && s.pressed]}
          >
            <AppIcon name="edit" size={17} color={C.ink} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={diary.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
            hitSlop={6}
            onPress={(event) => { event.stopPropagation(); onFavorite(diary.id); }}
            style={({ pressed }) => [s.cardAction, pressed && s.pressed]}
          >
            <AppIcon name="star" size={18} color={diary.favorite ? '#E8AF45' : C.inkSoft} fill={diary.favorite ? '#E8AF45' : 'none'} />
          </Pressable>
        </View>
      </View>
      <View style={[s.cardInfo, layout === 'list' && s.cardInfoList, layout === 'carousel' && s.cardInfoCarousel, compact && layout === 'carousel' && s.cardInfoCarouselCompact, layout === 'grid' && s.cardInfoGrid]}>
        <View style={s.cardHeading}>
          <View style={s.cardTitleWrap}>
            <Text numberOfLines={1} style={s.cardTitle}>{diary.title}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${diary.title} 휴지통으로 이동`}
            hitSlop={4}
            onPress={(event) => { event.stopPropagation(); onDelete?.(diary); }}
            style={({ pressed }) => [s.cardDelete, pressed && s.pressed]}
          >
            <AppIcon name="trash" size={19} color={C.danger} />
          </Pressable>
        </View>
        <Text style={s.cardDate}>{formatUpdatedAt(diary.updatedAt)}</Text>
      </View>
    </Pressable>
  );

  return layout === 'carousel' ? <Animated.View style={[animatedStyle, carouselActive && s.carouselCardTop]}>{card}</Animated.View> : card;
}

export default memo(DiaryCard);
