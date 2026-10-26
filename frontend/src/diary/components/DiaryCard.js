import { memo } from 'react';
import { C } from '../constants';
import { DISABLED_OPACITY } from '../../shared/theme';
import { Animated, Pressable, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';
import Cover from './Cover';
import { isSharedDiary } from '../utils/libraryQuery';

// onOpen·onFavorite·onEdit·onDelete·onToggleSelect는 다이어리를 인자로 받는 공용 콜백이다.
// 관리 모드(selecting)에서는 누르면 열지 않고 선택만 바꾸며, 잘못 누르지 않게 카드 안 버튼은 숨긴다.
function DiaryCard({ diary, pageCount, layout = 'grid', compact = false, onOpen, onFavorite, onEdit, onDelete, carouselActive = false, animatedStyle, selecting = false, selected = false, onToggleSelect }) {
  // 로컬 요약이 있으면 그것을 사용한다. null은 조회 실패, undefined는 아직 확인 전이다.
  const count = pageCount === undefined ? diary.pageCount : pageCount;
  const countLabel = count === undefined ? '페이지 수 확인 중'
    : Number.isSafeInteger(count) && count >= 0 ? `${count}페이지` : '페이지 수 확인 불가';
  const card = (
    <Pressable
      disabled={selecting && diary.canManage === false}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityLabel={selecting ? `${diary.title} 선택` : `${diary.title} 열기`}
      accessibilityHint={`${isSharedDiary(diary) ? '공유 다이어리, ' : ''}${countLabel}`}
      accessibilityState={selecting ? { checked: selected } : layout === 'carousel' ? { selected: carouselActive } : undefined}
      aria-checked={selecting ? selected : undefined}
      onPress={() => (selecting ? onToggleSelect?.(diary) : onOpen(diary))}
      style={({ pressed }) => [
        s.card,
        layout === 'list' ? s.cardList : layout === 'carousel' ? s.cardCarousel : s.cardGrid,
        compact && layout === 'carousel' && s.cardCarouselCompact,
        compact && layout === 'grid' && s.cardGridCompact,
        selected && s.cardSelected,
        pressed && s.pressed,
      ]}
    >
      <View style={s.cardCoverWrap}>
        <Cover diary={diary} small={layout === 'list'} carousel={layout === 'carousel'} grid={layout === 'grid'} compact={compact} />
        {selecting && diary.canManage !== false && <View pointerEvents="none" style={[s.cardCheck, selected && s.cardCheckOn]}>
          <Text style={s.cardCheckMark}>{selected ? '✓' : ''}</Text>
        </View>}
        {!selecting && <View style={s.cardActions}>
          {diary.canManage !== false && <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${diary.title} 수정`}
            disabled={!onEdit || diary.canEdit === false}
            accessibilityState={{ disabled: !onEdit || diary.canEdit === false }}
            hitSlop={6}
            onPress={(event) => { event.stopPropagation(); onEdit?.(diary); }}
            style={({ pressed }) => [s.cardAction, (!onEdit || diary.canEdit === false) && { opacity: DISABLED_OPACITY }, pressed && s.pressed]}
          >
            <AppIcon name="edit" size={17} color={C.ink} />
          </Pressable>}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={diary.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
            disabled={!onFavorite}
            accessibilityState={{ disabled: !onFavorite }}
            hitSlop={6}
            onPress={(event) => { event.stopPropagation(); onFavorite?.(diary.id); }}
            style={({ pressed }) => [s.cardAction, !onFavorite && { opacity: DISABLED_OPACITY }, pressed && s.pressed]}
          >
            <AppIcon name="star" size={18} color={diary.favorite ? '#E8AF45' : C.inkSoft} fill={diary.favorite ? '#E8AF45' : 'none'} />
          </Pressable>
        </View>}
      </View>
      <View style={[s.cardInfo, layout === 'list' && s.cardInfoList, layout === 'carousel' && s.cardInfoCarousel, compact && layout === 'carousel' && s.cardInfoCarouselCompact, layout === 'grid' && s.cardInfoGrid]}>
        <View style={s.cardHeading}>
          <View style={s.cardTitleWrap}>
            <View style={s.cardTitleRow}>
              <Text numberOfLines={1} style={[s.cardTitle, s.cardTitleInRow]}>{diary.title}</Text>
              {isSharedDiary(diary) && <View accessible accessibilityLabel="공유 다이어리" style={s.sharedDiaryIcon}><AppIcon name="people" size={16} color={C.inkSoft} /></View>}
            </View>
            <Text testID={`diary-page-count-${diary.id}`} style={s.cardPageCount}>{countLabel}</Text>
          </View>
          {/* 스와이프 화면의 옆 카드는 넘기려고 누르는 자리라 가운데 카드에만 둔다. */}
          {!selecting && diary.canManage !== false && (layout !== 'carousel' || carouselActive) && <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${diary.title} 휴지통으로 이동`}
            disabled={!onDelete}
            accessibilityState={{ disabled: !onDelete }}
            hitSlop={4}
            onPress={(event) => { event.stopPropagation(); onDelete?.(diary); }}
            style={({ pressed }) => [s.cardDelete, !onDelete && { opacity: DISABLED_OPACITY }, pressed && s.pressed]}
          >
            <AppIcon name="trash" size={19} color={C.danger} />
          </Pressable>}
        </View>
      </View>
    </Pressable>
  );

  return layout === 'carousel' ? <Animated.View style={[animatedStyle, carouselActive && s.carouselCardTop]}>{card}</Animated.View> : card;
}

export default memo(DiaryCard);
