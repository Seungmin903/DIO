import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import FavoriteStar from '../../shared/FavoriteStar';
import { C } from '../constants';
import { styles as s } from '../styles';
import { CoverSurface } from './CoverArt';
import DiaryActionBubble from './DiaryActionBubble';
import StaticPage from '../../editor/components/canvas/StaticPage';
import { pageSize } from '../../editor/utils/pageGeometry.js';
import { editorDocKey, loadEditorSpread, peekEditorSpread, prefetchPageTemplate } from '../../editor/services/editorDocs';
import { createDefaultDoc } from '../../editor/state/defaultDoc';
import { normalizeOrientation } from '../../editor/templates/catalog.js';
import { bandAutoColor, coverTone, mix, normalizeCover, relativeLuminance } from '../utils/coverDesign';
import { spreadAt, spreadOf } from '../utils/bookSpread';
import { nearestBook, rowOf } from '../utils/bookRow.js';
import { CAROUSEL_SCALE, OPEN_BOOK_LIFT, OPEN_BOOK_SCALE, carouselMotion } from '../utils/carouselFollow';

// '펼쳐서' 보기: 모든 다이어리를 실제 하드커버처럼 펼친 채 한 줄로 놓고, 스와이프 보기처럼 손가락을 따라 흐르듯 넘긴다(2026-11-08 지라 683).
// - 놓으면 가장 가까운 다이어리가 가운데에 오도록 붙는다(한 번에 한 권). 좌우 화살표 · 옆 책을 누르면 그 다이어리까지 부드럽게 흘러간다.
//   가운데 다이어리는 스와이프 가운데 표지처럼 흰 3px 테두리, 옆 다이어리는 얇은 라벤더 2px 테두리를 두른다.
// - 가운데 다이어리와 앞뒤 두 권만 그린다(그 밖은 그리지 않는다). 앞뒤 권의 문서 · 속지는 미리 읽어 둬 넘어온 순간 바로 보인다.
// - 세로 · 가로 다이어리는 같은 종이 넓이, 모든 책의 아랫변을 한 기준선에. 캡션(이름 · 쪽수 · 즐겨찾기 · 더보기)은 책마다 그 아래에.
// - 펼친 면은 실제 양면이다(좌철이라 오른쪽이 홀수 쪽). 1쪽이면 왼쪽은 표지 안쪽 면지(무지). 페이지는 면을 가장자리까지 채운다.
// - 하드커버 디테일: 표지 판은 종이 밖으로 조금만(표지 무늬 그대로), 가운데 제본선 골, 책등 띠와 접히는 홈 둘(위 · 아래 가장자리에서만 보임),
//   종이 묶음 책등 끝의 머리띠(headband)가 종이 위 · 아래로 조금 비어져 나온다.
// - 스와이프 보기와 똑같이 한 번에 한 권만 보인다(옆 다이어리는 화면 밖, 폰 · 태블릿 같다).
// - 폰과 세로로 세운 태블릿은 양면이 다 들어오면 너무 작아 가장 최근 쪽 한 면 크기로 맞춘다. 세로 태블릿은 가장 최근 쪽을 화면 가운데에 두고
//   마주 보는 쪽이 화면 끝에 걸쳐 보인다(왼쪽으로 걸친 면은 바탕색으로 흐려지며 사라진다). 폰은 한 면만.
// 창빛은 책상에만 비추므로 책 위에는 아무 빛도 얹지 않는다.

const PAPER = '#FAF6EC'; // 속지 종이(아주 살짝 따뜻하게)
const RATIO = { portrait: 768 / 1024, landscape: 1188 / 840 }; // 속지 한 면의 가로 / 세로
const MAX_AREA = 700 * 495; // 종이 한 면의 최대 넓이(px²)
const GAP = 42; // 책과 책 사이
const PEEK = 56; // 옆 다이어리가 적어도 이만큼은 보이게 남기는 폭(가로 다이어리를 펼쳤을 때)
const BLEED = 30; // 태블릿 화면 좌우 여백(libraryGridScroll). 책상은 이 여백까지 넘어 화면 끝까지 쓴다
// 폰 좌우 화살표: 스와이프 보기와 같은 자리(화면 끝에서 4). 펼쳐서 영역은 화면 여백(s.libraryScreenCompact 14) 안쪽이라,
// 바깥 틀(phoneFrame)을 그 여백만큼 화면 끝까지 넓히고 화살표를 틀 안에 둔다(안드로이드는 부모 밖으로 나간 부분의 터치를 전달하지 않는다)
const PHONE_EDGE = s.libraryScreenCompact.paddingHorizontal;
const PHONE_ARROW_SIDE = 4;
// 화살표 안쪽: 가장 넓은 가로 다이어리도 좌우 화살표(48)에 닿지 않게 화살표 안쪽 끝에서 ARROW_GAP 더 띄운 폭만큼 영역 끝을 비운다(2026-11-08 지라 683).
// 예전엔 가로 다이어리 한 면이 화살표 밑까지 펼쳐져 화살표가 종이 위에 얹혀 보였다
const ARROW = 48;
const ARROW_GAP = 8;
const TABLET_ARROW_EDGE = BLEED + 4 + ARROW + ARROW_GAP; // 영역(BLEED 만큼 넓힘) 끝 → 화살표 안쪽 끝 + 틈
// 폰: 가장 넓은 가로 다이어리의 판 폭을 스와이프 가운데 표지의 긴 변(카드 268 × 가운데 1.06)과 같게 한다(2026-11-08 사용자 결정 '스와이프만큼 커져도').
// 스와이프 표지도 좌우 화살표 칸 바로 안쪽까지 온다. 세로 다이어리는 같은 종이 넓이라 함께 맞춰진다
const PHONE_SWIPE_LONG = s.cardCarouselCompact.width * CAROUSEL_SCALE[1];
// 좁은 폰(분할 화면 · 큰 글꼴)에서는 화살표 칸(화면 끝 4 + 48) 안쪽까지만. 영역은 화면 여백(PHONE_EDGE) 안쪽이라 그만큼 뺀다
const PHONE_ARROW_INSET = PHONE_ARROW_SIDE + ARROW - PHONE_EDGE;
// 세로 태블릿 스와이프 보기에서 가운데 카드 중심이 이 영역 가운데보다 올라간 거리(실기기에서 두 보기를 겹쳐 맞춘 값)
// (carouselShellPortrait 아래 여백을 바꾸면 그 절반만큼 같이 바꾼다: 여백 120 → 79)
const SWIPE_CENTER_UP = 79;
// 폰: 스와이프 보기의 표지 가운데가 영역 가운데보다 올라간 거리(실기기 2026-11-08 두 보기를 겹쳐 잰 값).
// carouselShellCompact 아래 여백 60 · carouselArrowCompact -62 와 짝이다. 예전엔 세로 태블릿 값(79)을 같이 써서 펼쳐서 책이 30 높았다
const PHONE_SWIPE_CENTER_UP = 49;
// 가로 태블릿: 스와이프 보기의 좌우 화살표 · 카드 줄 가운데 높이(영역 위에서부터). 펼쳐서의 화살표 · 책 가운데를 여기에 맞춘다.
// 예전엔 맞추는 값이 없어 책 판 두께가 바뀌자(2026-11-02) 펼쳐서 책 · 화살표가 15 올라가 검색 줄에 붙었다
const SWIPE_ROW_CENTER = s.carouselShell.paddingTop + s.carouselRow.height / 2;
const CAPTION = 64; // 기준선 아래 캡션 자리
const AHEAD = 2; // 화면 가운데 다이어리 앞뒤로 그려 두는 권수(그 밖은 그리지 않는다)
const MOVE_MS = 450; // 화살표 · 옆 책으로 넘기는 부드러운 이동이 끝나기를 기다리는 시간(스크롤 끝 이벤트가 없을 때의 보험, 스와이프와 같다)
const IDLE_MS = 160; // 스크롤이 이만큼 멈추면 가장 가까운 다이어리에 붙인다(스냅이 없는 웹 · 튕김 없이 놓은 경우)
const SHADOW = '0 8px 16px rgba(28,28,28,0.12)';

const orientationOf = diary => normalizeOrientation(diary?.templateConfig?.orientation ?? diary?.pageSize);
const devicePx = value => PixelRatio.roundToNearestPixel(value); // 기기 픽셀(1px)의 정수배로
const leafOf = (area, ratio) => ({ width: Math.sqrt(area * ratio), height: Math.sqrt(area / ratio) });

/** 다이어리 한 권의 크기: 종이 한 면 · 표지 판 두께 · 반쪽(책등에서 바깥 끝까지 = 닫힌 책 폭) · 높이 */
function bookSize(diary, paper) {
  const exact = leafOf(paper, RATIO[orientationOf(diary)]);
  // 종이 높이와 표지 판 두께를 기기 픽셀 단위로 맞춘다. 배율 1.75 태블릿에서 6dp 는 10.5px 라 위 · 아래 가장자리가 따로 반올림돼 아래쪽 속지~표지 여백이 2px 좁아 보였다(위 · 아래 여백이 항상 같다)
  const leaf = { width: exact.width, height: devicePx(exact.height) };
  const scale = Math.max(leaf.width, leaf.height) / 680;
  // 표지 판이 종이 밖으로 나오는 폭(제본의 '스퀘어'). 양장 제본은 판지가 속지보다 사방 3~4.8mm 크고(짧은 변 130mm 노트의 2.5~3%),
  // 바깥(앞)쪽이 위 · 아래보다 조금 넓다(1.2~1.5배). 짧은 변에 비례해 세로 · 가로 다이어리가 같은 비율이다(조사 2026-11-01).
  const short = Math.min(leaf.width, leaf.height);
  const board = { top: devicePx(Math.round(short * 0.0275)), side: Math.round(short * 0.036) };
  return { leaf, scale, board, half: Math.round(leaf.width + board.side), height: leaf.height + board.top * 2 };
}

let lastArea = null; // 마지막으로 잰 책상 크기

// 펼침면 계산 결과. 같은 문서면 다시 계산하지 않는다(기본 문서 만들기 · 쪽 훑기를 화면을 열 때마다 하지 않게)
const spreads = new WeakMap(); // 저장된 문서 → 펼침면
// 저장된 문서가 없는 다이어리 → 기본 문서의 펼침면. 다이어리 객체를 키로 둬, 다이어리가 고쳐지면(새 객체) 다시 계산하고 옛 항목은 저절로 사라진다.
const fallbacks = new WeakMap();
function spreadFrom(diary, saved) {
  if (saved && spreads.has(saved)) return spreads.get(saved);
  if (!saved && fallbacks.has(diary)) return fallbacks.get(diary);
  const doc = saved ?? (diary.source === 'member-api' ? null : createDefaultDoc(diary));
  const spread = spreadOf(doc?.pages);
  const value = { latestPage: spread ? doc.pages[spread.latest - 1] : null, spread };
  if (saved) spreads.set(saved, value); else fallbacks.set(diary, value);
  return value;
}
// 일부 쪽만 읽어 온 재료 → 펼침면. { doc } 이면 문서 전체로 계산한다.
const partials = new WeakMap();
function spreadFromSource(diary, source) {
  if (!source.pageAt) return spreadFrom(diary, source.doc);
  if (!partials.has(source)) partials.set(source, { latestPage: source.pageAt(source.latest), spread: spreadAt(source.pageAt, source.latest, source.total) });
  return partials.get(source);
}
/** 메모리에 이미 읽어 둔 문서가 있으면 기다리지 않고 바로 펼침면을, 아직이면 undefined */
function peekSpread(diary) {
  const peek = diary ? peekEditorSpread(editorDocKey(diary)) : null;
  return peek ? spreadFromSource(diary, peek) : undefined;
}
/** 펼침면에 보이는 쪽들의 속지 그림을 미리 해석해 둔다(그릴 때 기다리지 않게) */
function prefetchSpread(value) {
  const { spread, latestPage } = value ?? {};
  if (!spread) return;
  [spread.left, spread.right, latestPage].forEach(page => { if (page && typeof page === 'object') prefetchPageTemplate(page); });
}
/**
 * 옆 다이어리(앞뒤 한 권씩 포함)의 문서와 속지를 미리 읽어 둔다. 다른 보기(스와이프 · 한눈에)에서도 불러
 * 펼쳐서 보기로 넘어온 그 순간에 속지가 이미 그려지게 한다.
 */
export function preloadOpenBooks(diaries, index, reach = 1) {
  for (let at = index - reach; at <= index + reach; at += 1) {
    const diary = diaries?.[at];
    if (diary) loadEditorSpread(diary).then(source => prefetchSpread(spreadFromSource(diary, source))).catch(() => {});
  }
}

function useSpread(diary) {
  // 메모리에 있으면 첫 그림부터 바로 쓴다(빈 종이로 한 번 그렸다가 바뀌지 않게)
  const [state, setState] = useState(() => ({ id: diary?.id, value: peekSpread(diary) }));
  if (diary && state.id !== diary.id) setState({ id: diary.id, value: peekSpread(diary) });
  const ready = state.id === diary?.id && state.value !== undefined;
  useEffect(() => {
    if (!diary || ready) return undefined;
    let alive = true;
    loadEditorSpread(diary)
      .then(source => { if (alive) setState({ id: diary.id, value: spreadFromSource(diary, source) }); })
      .catch(() => { if (alive) setState({ id: diary.id, value: null }); });
    return () => { alive = false; };
  }, [diary, ready]);
  return state.id === diary?.id ? state.value ?? null : null;
}

/** 면 하나: 실제 페이지를 면 폭에 맞춰 가장자리까지 그린다. 면지는 종이보다 조금 따뜻한 무지(줄을 넣으면 줄 노트로 읽힌다), 빈 종이는 단색. */
function Leaf({ page, width, height, endpaper, style }) {
  if (!page || typeof page === 'string') {
    return <View style={[styles.leaf, style, { width, height, backgroundColor: page === 'endpaper' ? endpaper : PAPER }]} />;
  }
  const size = pageSize(page);
  const zoom = width / size.width;
  return (
    <View style={[styles.leaf, style, { width, height }]}>
      <View style={{ marginTop: (height - size.height * zoom) / 2 }}>
        <StaticPage page={page} zoom={zoom} still background={PAPER} />
      </View>
    </View>
  );
}

/** 펼친 다이어리: 표지 판(종이 밖으로 보이는 가장자리) · 양면(compact 는 가장 최근 쪽 한 면) · 책등 · 머리띠 · 제본선 골 · 캡션 */
const OpenBook = memo(function OpenBook({ diary, size, left, top, active, compact, motion, onPress, onFavorite, onEdit, onDelete, onShare }) {
  const loaded = useSpread(diary);
  const cover = useMemo(() => normalizeCover(diary), [diary]);
  const [menu, setMenu] = useState(null);
  const moreRef = useRef(null);
  const { leaf, board, half, height } = size;
  const width = half * (compact ? 1 : 2);
  // 펼친 판의 바깥 모서리는 닫힌 표지의 바깥(앞쪽) 모서리와 같은 둥글기다: 판 반쪽(= 닫힌 표지 한 장)의 짧은 변 200 기준 14 (CoverArt coverBody)
  const radius = Math.round(14 * Math.min(half, height) / 200);
  const spread = loaded?.spread ?? null;
  const tone = cover.enabled ? (coverTone(cover) ?? '#C9CED8') : C.cardBorder;
  const light = /^#[0-9a-f]{6}$/i.test(tone) && relativeLuminance(tone) >= 0.92;
  const endpaper = mix(tone, PAPER, 0.9); // 면지: 종이에 표지색이 10%만 옅게 비치는 무지(예전 30% + 베이지 15%는 짙은 표지에서 종이보다 훨씬 어두워 보였다)
  const captionInk = C.ink;
  const headband = mix(cover.enabled ? (cover.band.color !== 'auto' ? cover.band.color : bandAutoColor(cover)) : '#7D88B5', '#8A8FA8', 0.35); // 고무줄 색을 한 단계 탁하게
  const spine = { width: 24, groove: 1.5, band: 18, bandOut: 4 }; // 책등 띠 폭 · 홈 굵기 · 머리띠 폭 · 종이 밖으로 보이는 머리띠 높이
  const page = side => (!spread ? null : compact ? loaded.latestPage : spread[side]);
  const act = fn => () => { setMenu(null); fn?.(); };
  const manage = diary.canManage !== false;
  const actions = [
    manage && { id: 'edit', label: `${diary.title} 수정`, text: '수정', icon: 'edit', disabled: !onEdit || diary.canEdit === false, onPress: act(() => onEdit?.(diary)) },
    onShare && { id: 'share', label: `${diary.title} 공유`, text: '공유', icon: 'share', onPress: act(() => onShare(diary)) },
    manage && diary.canDelete !== false && { id: 'trash', label: `${diary.title} 휴지통으로 이동`, text: '휴지통으로 이동', icon: 'trash', disabled: !onDelete, onPress: act(() => onDelete?.(diary)) },
  ].filter(Boolean);

  return (
    // 넘기는 동안의 크기 · 높이 · 투명도 변화는 스와이프 카드와 같은 움직임(motion.card). 투명해지는 건 화면 밖(두 칸 떨어진) 다이어리뿐이라 한 장으로 합쳐 그리지 않는다(합치면 판 밖 테두리가 잘린다)
    // 화면 밖에 미리 그려 둔 옆 다이어리는 스크린리더가 읽지 않는다(가운데 다이어리만, 옆으로는 좌우 화살표로 간다)
    <Animated.View accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      style={[styles.book, { left: devicePx(left), top: devicePx(top), width, height: height + CAPTION }, motion?.card]}>
      {/* 스와이프 표지 프레임과 같은 테두리: 가운데 다이어리는 흰 3px + 그림자, 옆 다이어리는 라벤더 2px. 판에 틈 없이 붙어 바깥을 감싼다 */}
      <View pointerEvents="none" style={[styles.ring, active ? s.coverFrameActive : s.coverFrameIdle, ringBox(active ? 3 : 2, radius, compact, width, height)]} />
      <Pressable accessibilityRole="button" accessibilityLabel={active ? `${diary.title} 열기` : `${diary.title} 가운데로`} onPress={() => onPress(diary)}
        style={[styles.board, { width, height, borderRadius: radius, backgroundColor: tone, paddingVertical: board.top, boxShadow: SHADOW },
          compact ? { paddingRight: board.side, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 } : { paddingHorizontal: board.side }]}>
        {/* 표지 판: 종이 밖으로 보이는 가장자리에 표지 무늬(그라데이션 · 사진) 그대로 */}
        {cover.enabled && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: radius }, compact && { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }]}>
          <CoverSurface cover={cover} width={width} height={height} scale={Math.min(leaf.width, leaf.height) / 200} />
        </View>}
        {!compact && <>
          {/* 책등 띠와 양옆 접히는 홈: 종이가 덮어 위 · 아래 표지 가장자리에서만 보인다 */}
          {[0, height - board.top].map(y => (
            <View key={y} pointerEvents="none" style={[styles.spineBand, { top: y, height: board.top, left: width / 2 - spine.width / 2, width: spine.width }]}>
              <View style={[styles.groove, { left: 0, width: spine.groove }]} />
              <View style={[styles.groove, { right: 0, width: spine.groove }]} />
            </View>
          ))}
          {/* 머리띠: 종이 묶음 책등 끝의 줄무늬 천. 종이 아래에 깔려 위 · 아래 끝 밖으로만 조금 비어져 나온다 */}
          {[board.top - spine.bandOut, board.top + leaf.height].map(y => (
            <View key={y} pointerEvents="none" style={[styles.headband, { top: y, left: width / 2 - spine.band / 2, width: spine.band, height: spine.bandOut, borderRadius: spine.bandOut / 2 }]}>
              {Array.from({ length: 9 }, (_, i) => <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? '#F3EEE2' : headband }} />)}
            </View>
          ))}
          <Leaf page={page('left')} width={leaf.width} height={leaf.height} endpaper={endpaper} style={styles.leftLeaf} />
        </>}
        <Leaf page={page('right')} width={leaf.width} height={leaf.height} endpaper={endpaper} style={styles.rightLeaf} />
        {/* 밝은 표지(상대 휘도 92% 이상)는 책상과 같은 색이라 바깥 윤곽에만 옅은 1px 테두리(코덱스 2026-11-01). 판 크기가 바뀌지 않게 위에 겹친다 */}
        {light && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.outline, { borderRadius: radius }, compact && { borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeftWidth: 0 }]} />}
        {/* 제본선 골: 가운데가 가장 깊고 양옆으로 부드럽게 사라진다 (폰은 왼쪽 책등 쪽만) */}
        <View pointerEvents="none" style={[styles.gutter, { top: board.top, height: leaf.height },
          compact ? { left: 0, width: 10, backgroundImage: 'linear-gradient(to right, rgba(28,28,28,0.12), rgba(28,28,28,0))' }
            : { left: width / 2 - 20, width: 40, backgroundImage: 'linear-gradient(to right, rgba(28,28,28,0) 0%, rgba(28,28,28,0.07) 38%, rgba(28,28,28,0.16) 50%, rgba(28,28,28,0.07) 62%, rgba(28,28,28,0) 100%)' }]} />
      </Pressable>
      {/* 이름 줄: 한눈에 · 스와이프 카드와 같은 구조 — 책 왼쪽 끝에 맞춘 이름 · 쪽수 두 줄, 오른쪽 끝에 별 · ⋯. 카드 · 테두리 없이 글자만
          (별은 판 위가 아니라 줄 안: 판 가장자리는 6~8px 뿐이라 별이 사용자의 속지 위에 놓인다) */}
      <Animated.View style={[styles.caption, { width, top: height + 10 }, motion?.info]}>
        <View style={styles.captionText}>
          <Text numberOfLines={1} style={s.cardTitle}>{diary.title}</Text>
          {spread && <Text style={s.cardPageCount}>{compact ? `${spread.latest} / ${spread.total}` : spread.label}</Text>}
        </View>
        {/* 별 · ⋯ 는 스와이프처럼 가운데 다이어리에만(옆 다이어리는 이름 · 쪽수만) */}
        {active && <View style={styles.captionTools}>
          {onFavorite && <Pressable accessibilityRole="button" accessibilityLabel={diary.favorite ? `${diary.title} 즐겨찾기 해제` : `${diary.title} 즐겨찾기`}
            accessibilityState={{ selected: !!diary.favorite }} onPress={() => onFavorite(diary)} hitSlop={4} style={styles.captionTool}>
            <FavoriteStar filled={!!diary.favorite} outline={captionInk} size={22} />
          </Pressable>}
          {actions.length > 0 && <Pressable ref={moreRef} accessibilityRole="button" accessibilityLabel={`${diary.title} 더보기`} accessibilityState={{ expanded: menu !== null }} hitSlop={4} style={styles.captionTool}
            onPress={() => {
              const node = moreRef.current;
              if (node?.measureInWindow) node.measureInWindow((mx, my, w, h) => setMenu({ anchor: { x: mx, y: my, width: w, height: h } })); // 말풍선이 이름 밑 쪽수 줄을 가리지 않게 그만큼 아래에 연다(DiaryCard 와 같은 값)
              else setMenu({ anchor: null });
            }}>
            <AppIcon name="more" size={22} color={captionInk} />
          </Pressable>}
        </View>}
      </Animated.View>
      {menu && <DiaryActionBubble anchor={menu.anchor} title={diary.title} actions={actions} onClose={() => setMenu(null)} />}
    </Animated.View>
  );
});

/** 테두리 자리: 판보다 두께만큼 바깥, 모서리는 판 둥글기 + 두께(폰 · 세로 태블릿의 한 면은 책등 쪽이 각지다) */
function ringBox(ring, radius, compact, width, height) {
  const round = radius + ring;
  return { left: -ring, top: -ring, width: width + ring * 2, height: height + ring * 2, borderRadius: round, ...(compact ? { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 } : null) };
}

function OpenBookShelf({ diaries, index, onIndexChange, onOpen, onFavorite, onEdit, onDelete, onShare, compact = false }) {
  // 지난번에 잰 크기로 바로 그린다(다른 보기에서 넘어올 때 크기를 재는 한 프레임 동안 비어 있지 않게). 다르면 onLayout 이 고친다.
  const [area, setArea] = useState(() => lastArea);
  // 한 면만(가장 최근 쪽): 폰과 세로로 세운 태블릿. 펼친 양면이 너무 작아진다(2026-11-08 세로 태블릿도 폰처럼 한 면, 걸친 면 · 페이드 없음)
  const upright = area != null && area.height > area.width;
  const single = compact || upright;

  // 축척: 세로 · 가로 어느 다이어리가 와도 같은 값이 되도록 두 방향을 함께 맞춘다(바뀌어도 종이 크기가 같게).
  // 가로 펼침은 폭(옆 다이어리가 PEEK 만큼 보일 자리를 남기고), 세로 펼침은 높이(캡션 자리를 남기고)에 맞춘다. 한 면 보기는 옆 다이어리가 걸칠 자리를 남긴다.
  const layout = useMemo(() => {
    if (!area) return null;
    // 폰은 가장 넓은 가로 다이어리 판 폭 = 스와이프 표지 긴 변(PHONE_SWIPE_LONG, 판은 종이보다 약 3% 넓다)
    const room = { width: compact ? Math.min(PHONE_SWIPE_LONG, area.width - 2 * PHONE_ARROW_INSET) : area.width - 2 * (BLEED + GAP + PEEK), height: area.height - CAPTION - (compact ? 16 : 24) };
    const tall = !compact && area.height > area.width;
    const pairs = compact || tall ? 1 : 2;
    const byWidth = Math.min(...[RATIO.portrait, RATIO.landscape].map(r => (room.width / pairs / 1.03) ** 2 / r));
    const byHeight = Math.min(...[RATIO.portrait, RATIO.landscape].map(r => (room.height / 1.02) ** 2 * r));
    // 세로 태블릿: 스와이프 보기의 카드가 세로에서 커지는 만큼(cardCarousel → cardCarouselLarge) 종이도 같은 비율로 키운다.
    // 다만 가장 넓은 가로 다이어리 한 면이 좌우 화살표 안쪽(TABLET_ARROW_EDGE)에 들어오는 데까지만.
    const grow = tall ? (s.cardCarouselLarge.width / s.cardCarousel.width) ** 2 : 1;
    const fit = tall ? ((area.width - 2 * TABLET_ARROW_EDGE) / 1.03) ** 2 / RATIO.landscape : Infinity;
    const paper = Math.min(MAX_AREA * grow, byWidth * grow, fit, byHeight);
    // 기준선: 가장 키가 큰 펼침(세로)의 아랫변. 가로 다이어리는 그 위에 낮게 놓여 남는 위쪽은 상판으로 보인다.
    return { paper, base: Math.round(8 + leafOf(paper, RATIO.portrait).height * 1.02), width: area.width };
  }, [area, compact]);
  const sizes = useMemo(() => (layout ? diaries.map(diary => bookSize(diary, layout.paper)) : []), [diaries, layout]);
  // 스와이프 보기처럼 한 번에 한 권(옆 다이어리는 화면 밖, 폰 · 태블릿 같다)
  const row = useMemo(() => (layout && sizes.length ? rowOf(sizes, layout.width, single) : null), [layout, sizes, single]);

  // 스크롤: 손가락을 따라 흐르고, 놓으면 가장 가까운 다이어리가 가운데에 붙는다(한 번에 한 권, disableIntervalMomentum).
  // 가운데 다이어리(index)는 멈춘 뒤에 바꾼다. 움직이는 동안에는 지금 가운데 가까운 다이어리(near)만 따라가 그릴 범위를 정한다.
  const scrollRef = useRef(null);
  // 실제 스크롤 위치. 처음엔 0 이다(안드로이드는 contentOffset 을 무시해, 정한 자리로 직접 옮기기 전엔 첫 다이어리 자리에 있다)
  const scrollX = useRef(0);
  const placing = useRef(null); // 코드로 옮기는 중인 자리: 그 자리에 닿기 전의 스크롤 이벤트로 가운데 다이어리를 바꾸지 않는다
  const [landed, setLanded] = useState(false); // 정한 자리로 옮긴 뒤에 보인다(첫 다이어리가 한 번 비치지 않게)
  const scrollValue = useRef(new Animated.Value(scrollX.current)).current; // 네이티브 스크롤 위치(넘기는 동안의 움직임)
  const step = layout?.width ?? 0;
  // 다이어리 수 · 칸 폭이 바뀔 때만 움직임 노드를 새로 만든다(스와이프 보기와 같다)
  const motions = useMemo(() => Array.from({ length: diaries.length }, (_, at) => carouselMotion(scrollValue, at, step || 1, OPEN_BOOK_SCALE, OPEN_BOOK_LIFT)), [diaries.length, scrollValue, step]);
  const dragging = useRef(false);
  const target = useRef(null); // 화살표 · 옆 책으로 흘러가는 중인 다이어리
  const moveTimer = useRef(null);
  const idleTimer = useRef(null);
  const [near, setNear] = useState(index);
  const nearRef = useRef(index);
  useEffect(() => () => { clearTimeout(moveTimer.current); clearTimeout(idleTimer.current); }, []);
  const follow = at => { if (nearRef.current !== at) { nearRef.current = at; setNear(at); } };
  const nearestAt = x => (row ? nearestBook(row.offsets, x) : index);
  // 앞뒤 AHEAD 권의 문서 · 속지를 미리 읽어 둔다(넘어온 순간 속지가 이미 그려져 있게)
  useEffect(() => { preloadOpenBooks(diaries, near, AHEAD); }, [diaries, near]);

  // 바깥에서 가운데 다이어리가 바뀌었거나(다른 보기 · 필터) 배치가 바뀌면 그 자리로 바로 옮긴다. 그리기 전에 옮겨 엉뚱한 자리가 한 번 보이지 않게
  useLayoutEffect(() => {
    if (!row || dragging.current || target.current != null) return;
    const x = row.offsets[index];
    if (x == null) return;
    follow(index);
    if (landed && Math.abs(scrollX.current - x) <= 1) return undefined;
    placing.current = x;
    scrollRef.current?.scrollTo?.({ x, animated: false });
    // 스크롤 뷰가 처음 놓인 직후에는 옮기기가 무시될 수 있어 다음 프레임에 한 번 더 옮긴 뒤 보인다(스와이프 보기와 같은 방식)
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo?.({ x, animated: false });
      scrollX.current = x; scrollValue.setValue(x);
      placing.current = null;
      setLanded(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [row, index]);

  const settle = x => {
    if (!row) return;
    clearTimeout(idleTimer.current); clearTimeout(moveTimer.current);
    target.current = null;
    const at = nearestAt(x);
    follow(at);
    // 스냅이 없는 환경(웹)이나 덜 맞게 멈췄으면 마저 붙인다
    if (Math.abs(row.offsets[at] - x) > 1) scrollRef.current?.scrollTo?.({ x: row.offsets[at], animated: true });
    if (at !== index) onIndexChange(at);
  };
  // 화살표 · 옆 책: 그 다이어리까지 부드럽게 흘러간 뒤 가운데 다이어리를 바꾼다(스와이프 보기와 같다)
  const goTo = at => {
    if (!row || at < 0 || at >= diaries.length) return;
    target.current = at;
    follow(at);
    scrollRef.current?.scrollTo?.({ x: row.offsets[at], animated: true });
    clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(() => { target.current = null; scrollX.current = row.offsets[at]; if (at !== index) onIndexChange(at); }, MOVE_MS);
  };
  const goRef = useRef(goTo);
  goRef.current = goTo;
  const pressBook = useCallback(diary => {
    const at = diaries.indexOf(diary);
    if (at === index) onOpen(diary); else goRef.current(at);
  }, [diaries, index, onOpen]);

  const followScroll = event => {
    const x = event.nativeEvent.contentOffset.x;
    scrollX.current = x;
    if (placing.current != null) return;
    follow(nearestAt(x));
    clearTimeout(idleTimer.current);
    if (!dragging.current && target.current == null) idleTimer.current = setTimeout(() => { if (!dragging.current && target.current == null) settle(scrollX.current); }, IDLE_MS);
  };

  // 스크롤 위치는 네이티브로 움직임에 바로 넘기고(끊김 없이), JS 는 가운데 가까운 다이어리 · 멈춤만 따라간다. 이벤트는 한 번만 만든다
  const scrollListener = useRef(followScroll);
  scrollListener.current = followScroll;
  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { x: scrollValue } } }], { useNativeDriver: true, listener: event => scrollListener.current(event) }), [scrollValue]);

  // 가장 키 큰 펼침(세로 다이어리)의 가운데를 스와이프 보기 가운데 카드의 가운데와 같은 높이에 둔다(좌우 화살표도 이 높이).
  // 한 번에 한 권만 보이므로 다이어리마다 가운데를 이 선(화살표 가운데)에 맞춘다. 가로 다이어리가 아랫변에 맞춰 내려앉아 화살표보다 낮아 보였다(2026-11-08)
  const tallest = layout ? bookSize({ templateConfig: { orientation: 'portrait' } }, layout.paper).height : 0;
  const middle = layout ? layout.base - tallest / 2 : 0;

  if (!diaries[index]) return null;
  // 그리는 범위: 지금 가운데 가까운 다이어리 앞뒤 AHEAD 권 + 멈춰 있는 가운데 다이어리 앞뒤 한 권
  const books = row ? diaries.map((diary, at) => (Math.abs(at - near) <= AHEAD || Math.abs(at - index) <= 1) && (
    <OpenBook key={diary.id} active={at === index} diary={diary} size={sizes[at]} left={row.lefts[at]} top={Math.round(middle - sizes[at].height / 2)}
      compact={single} motion={motions[at]} onPress={pressBook} onFavorite={onFavorite} onEdit={onEdit} onDelete={onDelete} onShare={onShare} />
  )) : null;

  // 세로(태블릿 · 폰)는 영역 가운데에서 올라간 거리로, 가로 태블릿은 스와이프 화살표 줄 높이로 맞춘다.
  const center = !layout ? null
    : upright ? area.height / 2 - (compact ? PHONE_SWIPE_CENTER_UP : SWIPE_CENTER_UP)
      : compact ? null : SWIPE_ROW_CENTER;
  const lift = center == null ? 0
    : Math.max(0, Math.min(area.height - layout.base - CAPTION, Math.round(center - layout.base + tallest / 2)));

  // 좌우 화살표: 스와이프 보기와 같은 모양 · 자리, 높이는 가장 키 큰 펼침의 가운데(스와이프 화살표와 같은 높이).
  // 책 · 속지 위에 겹쳐도 보이도록 같은 화살표를 상판 바탕색으로 굵게 한 번 더 깔아 윤곽을 두른다.
  // 폰은 펼쳐서 영역(화면 여백 안쪽에서 잘림) 밖, 화면 끝 가까이에 둬야 해 영역 바깥에 겹쳐 그린다(2026-11-08 폰에도 화살표).
  const arrows = layout ? [[-1, 'left'], [1, 'right']].filter(([step]) => diaries[index + step]).map(([step, side]) => (
    <Pressable key={side} accessibilityRole="button" accessibilityLabel={step < 0 ? '이전 다이어리' : '다음 다이어리'} onPress={() => goRef.current((target.current ?? index) + step)}
      style={[s.carouselArrow, { top: lift + middle - 24, [side]: compact ? PHONE_ARROW_SIDE : BLEED + 4 }]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.arrowHalo}><AppIcon name={`chevron-${side}`} size={24} color={C.canvas} strokeWidth={6.5} /></View>
      </View>
      <AppIcon name={`chevron-${side}`} size={24} color={C.ink} strokeWidth={2.1} />
    </Pressable>
  )) : null;

  const shelf = (
    // 잰 크기는 정수로 내리고 1px 넘게 달라질 때만 바꾼다. 소수점 크기를 그대로 쓰면 책 크기 → 배치 반올림 → 다시 잰 크기가 오가며 책이 떨렸다.
    // 태블릿은 화면 여백(BLEED)까지 넘어 좌우 끝까지 책상으로 쓴다(옆 다이어리가 여백 선에서 잘리지 않게)
    <View style={[styles.area, compact ? styles.phoneArea : styles.bleed]} onLayout={event => {
      const w = Math.floor(event.nativeEvent.layout.width), h = Math.floor(event.nativeEvent.layout.height);
      setArea(current => {
        const next = current && Math.abs(current.width - w) <= 1 && Math.abs(current.height - h) <= 1 ? current : { width: w, height: h };
        lastArea = next;
        return next;
      });
    }}>
      {row && <Animated.ScrollView ref={scrollRef} horizontal style={StyleSheet.absoluteFill} contentContainerStyle={{ width: row.content, height: area.height }}
        contentOffset={{ x: row.offsets[index] ?? 0, y: 0 }} showsHorizontalScrollIndicator={false} directionalLockEnabled
        snapToOffsets={row.offsets} snapToStart={false} snapToEnd={false} decelerationRate="fast" disableIntervalMomentum scrollEventThrottle={16}
        onScroll={onScroll}
        onScrollBeginDrag={() => { dragging.current = true; target.current = null; clearTimeout(moveTimer.current); clearTimeout(idleTimer.current); }}
        onScrollEndDrag={event => { dragging.current = false; followScroll(event); }}
        onMomentumScrollEnd={event => { if (target.current == null && placing.current == null) settle(event.nativeEvent.contentOffset.x); }}>
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { top: lift, bottom: -lift }, !landed && styles.unlanded]}>{books}</View>
      </Animated.ScrollView>}
      {!compact && arrows}
    </View>
  );
  return compact ? <View style={styles.phoneFrame} pointerEvents="box-none">{shelf}{arrows}</View> : shelf;
}

export default memo(OpenBookShelf);

const styles = StyleSheet.create({
  area: { flex: 1, minHeight: 420, overflow: 'hidden' },
  phoneFrame: { flex: 1, minHeight: 420, marginHorizontal: -PHONE_EDGE }, // 폰: 화면 끝까지 넓힌 바깥 틀(화살표 자리)
  phoneArea: { marginHorizontal: PHONE_EDGE }, // 그 안의 펼쳐서 영역은 예전처럼 화면 여백 안쪽
  bleed: { marginHorizontal: -BLEED },
  arrowHalo: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  book: { position: 'absolute', left: 0 },
  ring: { position: 'absolute' },
  unlanded: { opacity: 0 },
  board: { flexDirection: 'row', boxShadow: SHADOW },
  clip: { overflow: 'hidden' },
  leaf: { backgroundColor: PAPER, overflow: 'hidden' },
  // 종이 모서리는 거의 각지고(4), 제본선 쪽은 각지다
  leftLeaf: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  rightLeaf: { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  // 책등 띠는 빛을 덜 받아 조금 어둡고, 홈은 더 어둡다. 오른쪽에 얇은 밝은 선을 둬 접힌 골처럼 보인다
  spineBand: { position: 'absolute', backgroundColor: 'rgba(28,28,28,0.08)' },
  outline: { borderWidth: 1, borderColor: 'rgba(28,28,28,0.12)' },
  groove: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(28,28,28,0.18)', boxShadow: '1px 0 0 rgba(255,255,255,0.3)' },
  headband: { position: 'absolute', flexDirection: 'row', overflow: 'hidden' },
  gutter: { position: 'absolute' },
  // 이름 줄: DiaryCard 의 cardInfoGrid(위 10 · 좌우 4)와 같은 여백, 별 · ⋯ 는 cardMoreSlot 처럼 이름 첫 줄에 맞춘다
  caption: { position: 'absolute', left: 0, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, paddingHorizontal: 4 },
  captionText: { flex: 1, minWidth: 0 },
  // 별 · ⋯ 는 스와이프 ⋯ 와 같은 터치 40 칸을 맞붙여 둔다(아이콘 사이 18, 예전 26은 멀어 보였다 2026-11-08). 아이콘은 이름 첫 줄에, 오른쪽 끝은 이름 줄 끝에 맞춘다
  captionTools: { flexDirection: 'row', alignItems: 'center', marginTop: -10, marginRight: -9 },
  captionTool: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
