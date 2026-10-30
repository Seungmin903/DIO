import { memo } from 'react';
import { C } from '../constants';
import { DISABLED_OPACITY } from '../../shared/theme';
import { Animated, Pressable, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import FavoriteStar from '../../shared/FavoriteStar';
import { styles as s } from '../styles';
import Cover from './Cover';
import { isSharedDiary } from '../utils/libraryQuery';
import { useDeskDark } from '../utils/deskInk';
import { COVER_GRADIENTS, normalizeCover } from '../utils/coverDesign';

// 즐겨찾기 안 한 별의 윤곽선: 표지 위에서는 흰색, 표지 바탕이 밝은 흰 노트이면 남색으로 쓴다(흰색 대비가 1.5:1 아래인 거의 흰 바탕일 때).
const luminance = hex => {
  const channel = shift => { const v = ((parseInt(hex.slice(1), 16) >> shift) & 255) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
};
function starOutlineFor(diary) {
  const cover = normalizeCover(diary);
  if (!cover.enabled) return C.ink; // 표지를 뺀 다이어리는 첫 페이지(밝은 속지)가 보인다
  // 사진 표지는 사진의 대표 색(photo.tone)으로 정한다. 흰 PDF 표지처럼 밝은 사진에서 흰 윤곽이 묻히지 않게. 아직 대표 색이 없으면 흰색.
  if (cover.kind === 'photo' && !cover.photo?.tone) return '#FFFFFF';
  const top = cover.kind === 'photo' ? cover.photo.tone : cover.gradient === 'custom' ? cover.gradientColors[0] : Number.isInteger(cover.gradient) ? COVER_GRADIENTS[cover.gradient][1][0] : cover.color;
  return 1.05 / (luminance(top) + 0.05) >= 1.5 ? '#FFFFFF' : C.ink;
}

// onOpen·onFavorite·onEdit·onDelete·onToggleSelect는 다이어리를 인자로 받는 공용 콜백이다.
// 관리 모드(selecting)에서는 누르면 열지 않고 선택만 바꾸며, 잘못 누르지 않게 카드 안 버튼은 숨긴다.
// sunShadow: 책상 위 표지라 그림자를 해 방향에 맞춘다
// infoStyle: 스와이프 옆 카드에서 이름 · 페이지 수를 흐리게 하는 애니메이션 값
function DiaryCard({ diary, pageCount, layout = 'grid', compact = false, large = false, portrait = false, onOpen, onFavorite, onEdit, onDelete, carouselActive = false, animatedStyle, infoStyle, selecting = false, selected = false, onToggleSelect, onEnterEdit, sunShadow = false, lightMotion = null }) {
  // 로컬 요약이 있으면 그것을 사용한다. null은 조회 실패, undefined는 아직 확인 전이다.
  // 책상이 어두운 시각에는 책상 위(제목 · 페이지 수) 글씨를 흰색으로 쓴다. 목록 보기는 흰 카드라 그대로 둔다.
  const onDark = useDeskDark(sunShadow && layout !== 'list');
  const count = pageCount === undefined ? diary.pageCount : pageCount;
  const countLabel = count === undefined ? '페이지 수 확인 중'
    : Number.isSafeInteger(count) && count >= 0 ? `${count}페이지` : '페이지 수 확인 불가';
  const card = (
    <Pressable
      disabled={selecting && (diary.canManage === false || diary.canDelete === false)}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityLabel={selecting ? `${diary.title} 선택` : `${diary.title} 열기`}
      accessibilityHint={`${isSharedDiary(diary) ? '공유 다이어리, ' : ''}${countLabel}`}
      accessibilityState={selecting ? { checked: selected } : layout === 'carousel' ? { selected: carouselActive } : undefined}
      aria-checked={selecting ? selected : undefined}
      onPress={() => (selecting ? onToggleSelect?.(diary) : onOpen(diary))}
      onLongPress={!selecting && diary.canManage !== false && diary.canDelete !== false ? () => onEnterEdit?.(diary) : undefined}
      // 누르면 반투명해진다. 안드로이드가 자식마다 따로 투명하게 해 그림자 · 뒤 요소가 비치지 않도록 한 장으로 합쳐 그린다
      needsOffscreenAlphaCompositing
      style={({ pressed }) => [
        s.card,
        layout === 'list' ? s.cardList : layout === 'carousel' ? s.cardCarousel : s.cardGrid,
        compact && layout === 'carousel' && s.cardCarouselCompact,
        large && layout === 'carousel' && s.cardCarouselLarge,
        compact && layout === 'grid' && s.cardGridCompact,
        portrait && layout === 'grid' && s.cardGridPortrait,
        selected && s.cardSelected,
        pressed && s.pressed,
      ]}
    >
      <View style={s.cardCoverWrap}>
        {/* 펜 · 휴지통 버튼과 선택 표시(왼쪽 위 별 포함)는 칸이 아니라 실제 표지(가로 다이어리는 낮은 표지) 모서리에 얹는다 */}
        <Cover diary={diary} small={layout === 'list'} carousel={layout === 'carousel'} grid={layout === 'grid'} fill={layout === 'grid'} compact={compact} large={large} centered={large} sunShadow={sunShadow} lightMotion={layout === 'carousel' ? lightMotion : null}>
        {selecting && diary.canManage !== false && diary.canDelete !== false && <View pointerEvents="none" style={[s.cardCheck, selected && s.cardCheckOn]}>
          {selected && <AppIcon name="check" size={18} color={C.white} strokeWidth={2.6} />}
        </View>}
        {!selecting && (layout !== 'carousel' || carouselActive) && <View style={s.cardActions}>
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
          {diary.canManage !== false && diary.canDelete !== false && <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${diary.title} 휴지통으로 이동`}
            disabled={!onDelete}
            accessibilityState={{ disabled: !onDelete }}
            hitSlop={6}
            onPress={(event) => { event.stopPropagation(); onDelete?.(diary); }}
            style={({ pressed }) => [s.cardAction, !onDelete && { opacity: DISABLED_OPACITY }, pressed && s.pressed]}
          >
            <AppIcon name="trash" size={18} color={C.danger} />
          </Pressable>}
        </View>}
        {!selecting && (layout !== 'carousel' || carouselActive) && <Pressable
          accessibilityRole="button"
          accessibilityLabel={diary.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          disabled={!onFavorite}
          accessibilityState={{ disabled: !onFavorite }}
          hitSlop={12}
          onPress={(event) => { event.stopPropagation(); onFavorite?.(diary.id); }}
          style={[s.cardFavorite, !onFavorite && { opacity: DISABLED_OPACITY }]}
        >
          <FavoriteStar filled={!!diary.favorite} outline={starOutlineFor(diary)} />
        </Pressable>}
        </Cover>
      </View>
      <Animated.View style={[s.cardInfo, layout === 'list' && s.cardInfoList, layout === 'carousel' && s.cardInfoCarousel, compact && layout === 'carousel' && s.cardInfoCarouselCompact, layout === 'grid' && s.cardInfoGrid, infoStyle]}>
        <View style={s.cardHeading}>
          <View style={s.cardTitleWrap}>
            <View style={s.cardTitleRow}>
              <Text numberOfLines={1} style={[s.cardTitle, s.cardTitleInRow, onDark && s.onDeskDarkTitle]}>{diary.title}</Text>
              {isSharedDiary(diary) && <View accessible accessibilityLabel="공유 다이어리" style={s.sharedDiaryIcon}><AppIcon name="people" size={16} color={onDark ? 'rgba(255,255,255,0.78)' : C.inkSoft} /></View>}
            </View>
            <Text testID={`diary-page-count-${diary.id}`} style={[s.cardPageCount, onDark && s.onDeskDarkSoft]}>{countLabel}</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );

  // 옆 카드는 반투명하다. 안드로이드는 기본으로 자식마다 투명도를 따로 적용해 라벨 뒤 고무줄 · 버튼 그림자가 비치므로
  // 카드를 한 장으로 합친 뒤 투명하게 한다.
  return layout === 'carousel' ? <Animated.View needsOffscreenAlphaCompositing renderToHardwareTextureAndroid style={[animatedStyle, carouselActive && s.carouselCardTop]}>{card}</Animated.View> : card;
}

export default memo(DiaryCard);
