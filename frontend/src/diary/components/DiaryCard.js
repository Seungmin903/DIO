import { memo, useRef, useState } from 'react';
import { C } from '../constants';
import { DISABLED_OPACITY } from '../../shared/theme';
import { Animated, Pressable, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import FavoriteStar from '../../shared/FavoriteStar';
import { styles as s } from '../styles';
import Cover from './Cover';
import DiaryActionBubble from './DiaryActionBubble';
import SelectionMark from './SelectionMark';
import { isSharedDiary } from '../utils/libraryQuery';
import { COVER_GRADIENTS, normalizeCover, relativeLuminance } from '../utils/coverDesign';
import { cardTapAction } from '../utils/libraryView';

// 스와이프 카드는 한 장으로 합쳐 그린다(아래 renderToHardwareTextureAndroid). 합친 그림은 View 경계에서 잘리는데, 가로 다이어리 표지는 카드 폭을 가득 채워
// 표지 바깥으로 나가는 효과(프레임 3px · 해 방향 그림자)가 좌우에서 통째로 잘렸다. 해 방향 그림자는 시간대에 따라 표지 밖으로 왼쪽 약 43 · 오른쪽 약 40(스와이프 가운데 카드는 1.06배) · 위 약 25 · 아래 약 31px 나가므로
// 그만큼의 여백을 두고 같은 크기의 음수 마진으로 자리는 그대로 둔다(styles.carouselEffectSpace 와 같은 값).
export const CAROUSEL_EFFECT_PAD = { x: 48, top: 28, bottom: 36 };

// 페이지 수 줄 높이(줄 18 + 위 간격 3, styles.cardPageCount)
export const PAGE_COUNT_ROW = 21;

// 즐겨찾기 별의 윤곽선: 표지 위에서는 흰색, 표지 바탕이 밝은 흰 노트이면 남색으로 쓴다(흰색 대비가 1.5:1 아래인 거의 흰 바탕일 때).
function starOutlineFor(diary) {
  const cover = normalizeCover(diary);
  if (!cover.enabled) return C.ink; // 표지를 뺀 다이어리는 첫 페이지(밝은 속지)가 보인다
  // 사진 표지는 사진의 대표 색(photo.tone)으로 정한다. 흰 PDF 표지처럼 밝은 사진에서 흰 윤곽이 묻히지 않게. 아직 대표 색이 없으면 흰색.
  if (cover.kind === 'photo' && !cover.photo?.tone) return '#FFFFFF';
  const top = cover.kind === 'photo' ? cover.photo.tone : cover.gradient === 'custom' ? cover.gradientColors[0] : Number.isInteger(cover.gradient) ? COVER_GRADIENTS[cover.gradient][1][0] : cover.color;
  return 1.05 / (relativeLuminance(top) + 0.05) >= 1.5 ? '#FFFFFF' : C.ink;
}

// onOpen·onCenter·onFavorite·onEdit·onDelete·onToggleSelect는 다이어리를 인자로 받는 공용 콜백이다. onCenter 는 스와이프 옆 카드를 눌렀을 때.
// 표지 왼쪽 위의 별(배경 없음)을 누르면 즐겨찾기를 켜고 끈다. 제목 줄 오른쪽 끝 `⋯` 버튼은 동작 말풍선(수정 · 휴지통으로 이동)을 띄운다.
// 관리 모드(selecting)에서는 누르면 열지 않고 선택만 바꾸며, 잘못 누르지 않게 카드 안 버튼은 숨긴다.
// cell: 태블릿 한눈에 보기의 칸 크기(px). 주면 카드 폭을 이 값으로 고정한다(폰은 퍼센트 폭). 제목 · ⋯ 는 어느 쪽이든 표지 양끝에 맞춘다
// infoStyle: 스와이프 옆 카드에서 이름 · 페이지 수를 흐리게 하는 애니메이션 값
function DiaryCard({ diary, pageCount, layout = 'grid', compact = false, large = false, cell = null, onOpen, onCenter, onFavorite, onEdit, onDelete, carouselActive = false, animatedStyle, infoStyle, selecting = false, selected = false, onToggleSelect, onEnterEdit }) {
  // 동작 말풍선: null 이면 닫힘, 열리면 ⋯ 버튼의 창 안 자리(anchor)를 들고 있다(재지 못하면 anchor 는 null)
  const [menu, setMenu] = useState(null);
  const moreRef = useRef(null);
  // 세로 표지는 칸보다 좁아 가운데에 놓인다. 이름 · 페이지 수를 그 표지의 왼쪽 끝에 맞추려고 Cover 가 알려 주는 값(가로 표지는 0)
  const [coverInset, setCoverInset] = useState(0);
  // 로컬 요약이 있으면 그것을 사용한다. null은 조회 실패, undefined는 아직 확인 전이다.
  // 책상이 어두운 시각에는 책상 위(제목 · 페이지 수) 글씨를 흰색으로 쓴다. 목록 보기는 흰 카드라 그대로 둔다.
  const count = pageCount === undefined ? diary.pageCount : pageCount;
  const countLabel = count === undefined ? '페이지 수 확인 중'
    : Number.isSafeInteger(count) && count >= 0 ? `${count}페이지` : '페이지 수 확인 불가';
  const showTools = !selecting && (layout !== 'carousel' || carouselActive);
  // 스와이프 옆 카드: 누르면 열지 않고 가운데로 오기만 한다(밀다 손이 떨어져 잘못 열리지 않게). 열기는 가운데 카드에서
  const tap = cardTapAction({ selecting, layout, carouselActive, canCenter: Boolean(onCenter) });
  const sideCard = tap === 'center';
  const closeMenu = () => setMenu(null);
  // 말풍선을 먼저 닫고 동작을 실행한다(동작이 확인 창을 열어도 시트가 남지 않게)
  const act = fn => () => { closeMenu(); fn?.(); };
  const canManage = diary.canManage !== false;
  const actions = [
    canManage && { id: 'edit', label: `${diary.title} 수정`, text: '수정', icon: 'edit', disabled: !onEdit || diary.canEdit === false, onPress: act(() => onEdit?.(diary)) },
    canManage && diary.canDelete !== false && { id: 'trash', label: `${diary.title} 휴지통으로 이동`, text: '휴지통으로 이동', icon: 'trash', disabled: !onDelete, onPress: act(() => onDelete?.(diary)) },
  ].filter(Boolean);
  const card = (
    <Pressable
      disabled={selecting && (diary.canManage === false || diary.canDelete === false)}
      accessibilityRole={selecting ? 'checkbox' : 'button'}
      accessibilityLabel={selecting ? `${diary.title} 선택` : sideCard ? `${diary.title} 가운데로` : `${diary.title} 열기`}
      accessibilityHint={`${isSharedDiary(diary) ? '공유 다이어리, ' : ''}${diary.favorite ? '즐겨찾기, ' : ''}${countLabel}`}
      accessibilityState={selecting ? { checked: selected } : layout === 'carousel' ? { selected: carouselActive } : undefined}
      aria-checked={selecting ? selected : undefined}
      onPress={() => (tap === 'select' ? onToggleSelect?.(diary) : tap === 'center' ? onCenter(diary) : onOpen(diary))}
      // 꾹 눌러 선택 모드에 들어온 손가락을 뗄 때 같은 터치가 onPress 로 한 번 더 와서 방금 고른 다이어리가 풀렸다.
      // 누르는 중에 onLongPress 가 사라지면 Pressable 이 '긴 누름이 눌림을 취소'했는지 판단하지 못하므로, 선택 중에도 관리할 수 있는 카드는 늘 넘긴다.
      onLongPress={canManage && diary.canDelete !== false ? () => (selecting ? onToggleSelect?.(diary) : onEnterEdit?.(diary)) : undefined}
      // 누르면 반투명해진다. 안드로이드가 자식마다 따로 투명하게 해 그림자 · 뒤 요소가 비치지 않도록 한 장으로 합쳐 그린다
      needsOffscreenAlphaCompositing
      style={({ pressed }) => [
        s.card,
        layout === 'list' ? s.cardList : layout === 'carousel' ? s.cardCarousel : s.cardGrid,
        compact && layout === 'carousel' && s.cardCarouselCompact,
        large && layout === 'carousel' && s.cardCarouselLarge,
        compact && layout === 'grid' && s.cardGridCompact,
        cell && layout === 'grid' && { width: cell },
        selected && s.cardSelected,
        pressed && s.pressed,
      ]}
    >
      <View style={s.cardCoverWrap}>
        {/* 더보기 버튼과 선택 표시(왼쪽 위 별 포함)는 칸이 아니라 실제 표지(가로 다이어리는 낮은 표지) 모서리에 얹는다 */}
        <Cover diary={diary} small={layout === 'list'} carousel={layout === 'carousel'} grid={layout === 'grid'} fill={layout === 'grid'} compact={compact} large={large} centered={large}
          frame={layout === 'carousel' ? (carouselActive ? 'active' : 'idle') : null} onInset={layout === 'list' ? null : setCoverInset}>
        {/* 스와이프의 표지 프레임(가운데 표지는 흰 3px + 그림자, 옆 표지는 얇은 라벤더 2px)은 표지 크기에서 모서리를 계산하는 Cover 가 그린다 */}
        {selecting && diary.canManage !== false && diary.canDelete !== false && <SelectionMark selected={selected} />}
        {showTools && <Pressable
          accessibilityRole="button"
          accessibilityLabel={diary.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          disabled={!onFavorite}
          accessibilityState={{ disabled: !onFavorite }}
          hitSlop={12}
          onPress={(event) => { event.stopPropagation(); onFavorite?.(diary.id); }}
          style={[s.cardFavorite, !onFavorite && { opacity: DISABLED_OPACITY }]}
        >
          {/* 안 칠한 별의 흰 윤곽은 80%로 한 단계 낮춘다(원 페이저 06). 밝은 표지 위 남색 윤곽 · 칠한 별은 그대로 */}
          <FavoriteStar filled={!!diary.favorite} outline={!diary.favorite && starOutlineFor(diary) === '#FFFFFF' ? 'rgba(255,255,255,0.8)' : starOutlineFor(diary)} />
        </Pressable>}
        </Cover>
      </View>
      <Animated.View style={[s.cardInfo, (layout === 'carousel' || layout === 'grid') && coverInset > 0 && { marginLeft: coverInset, marginRight: coverInset }, layout === 'list' && s.cardInfoList, layout === 'carousel' && s.cardInfoCarousel, compact && layout === 'carousel' && s.cardInfoCarouselCompact, layout === 'grid' && s.cardInfoGrid, infoStyle]}>
        <View style={s.cardHeading}>
          <View style={s.cardTitleWrap}>
            <View style={s.cardTitleRow}>
              <Text numberOfLines={1} style={[s.cardTitle, s.cardTitleInRow]}>{diary.title}</Text>
              {isSharedDiary(diary) && <View accessible accessibilityLabel="공유 다이어리" style={s.sharedDiaryIcon}><AppIcon name="people" size={16} color={C.inkSoft} /></View>}
            </View>
            <Text testID={`diary-page-count-${diary.id}`} style={s.cardPageCount}>{countLabel}</Text>
          </View>
          {actions.length > 0 && <View style={s.cardMoreSlot}>
            {showTools && <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${diary.title} 더보기`}
              accessibilityState={{ expanded: menu !== null }}
              hitSlop={8}
              ref={moreRef}
              onPress={(event) => {
                event.stopPropagation();
                const node = moreRef.current;
                if (node?.measureInWindow) node.measureInWindow((x, y, width, height) => setMenu({ anchor: { x, y, width, height: height + PAGE_COUNT_ROW } })); // 말풍선이 제목 밑 페이지 수 줄을 가리지 않게 그만큼 아래에 연다
                else setMenu({ anchor: null });
              }}
              style={s.cardMore}
            >
              <AppIcon name="more" size={22} color={C.ink} />
            </Pressable>}
          </View>}
        </View>
      </Animated.View>
    </Pressable>
  );
  // 동작 말풍선은 카드(Pressable) 밖에 둔다. 안에 두면 말풍선을 눌렀을 때 터치가 카드로 올라가 다이어리가 열린다.
  const sheet = menu ? <DiaryActionBubble anchor={menu.anchor} title={diary.title} actions={actions} onClose={closeMenu} /> : null;

  // 옆 카드는 반투명하다. 안드로이드는 기본으로 자식마다 투명도를 따로 적용해 라벨 뒤 고무줄 · 버튼 그림자가 비치므로
  // 카드를 한 장으로 합친 뒤 투명하게 한다.
  return layout === 'carousel'
    ? <Animated.View needsOffscreenAlphaCompositing renderToHardwareTextureAndroid pointerEvents="box-none" style={[s.carouselEffectSpace, animatedStyle, { transformOrigin: `50% ${CAROUSEL_EFFECT_PAD.top}px` }, carouselActive && s.carouselCardTop]}>{card}{sheet}</Animated.View>
    : <>{card}{sheet}</>;
}

export default memo(DiaryCard);
