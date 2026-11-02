import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import FavoriteStar from '../../shared/FavoriteStar';
import { C, DESK_COLOR } from '../constants';
import { styles as s } from '../styles';
import CoverArt, { CoverSurface } from './CoverArt';
import { PAGE_COUNT_ROW } from './DiaryCard';
import DiaryActionBubble from './DiaryActionBubble';
import StaticPage from '../../editor/components/canvas/StaticPage';
import { pageSize } from '../../editor/utils/pageGeometry.js';
import { editorDocKey, loadEditorDoc, peekEditorDoc, prefetchPageTemplate } from '../../editor/services/editorDocs';
import { createDefaultDoc } from '../../editor/state/defaultDoc';
import { normalizeOrientation } from '../../editor/templates/catalog.js';
import { bandAutoColor, coverTone, mix, normalizeCover, relativeLuminance } from '../utils/coverDesign';
import { spreadOf } from '../utils/bookSpread';

// '펼쳐서' 보기: 책상 가운데 '펼침 자리'에 한 권만 실제 하드커버처럼 펼쳐 두고, 양옆에는 나머지 다이어리가 닫힌 채 순서대로 놓인다.
// - 움직이는 연출은 없다. 끄는 동안에도 그대로 있다가 놓으면(또는 좌우 화살표 · 옆 책을 누르면) 바로 옆 다이어리가 펼친 모습으로 바뀐다
//   (양옆 닫힌 줄도 새 자리에 바로 놓인다).
//   책 순서는 바뀌지 않고 어느 책이 펼쳐졌는지만 바뀐다. 닫힌 표지와 펼친 책 가장자리(표지 무늬) · 머리띠(고무줄 색)가 같은 물건임을 알려 준다.
// - 세로 · 가로 다이어리는 같은 종이 넓이, 모든 책의 아랫변을 한 기준선에. 캡션(이름 · 쪽수 · 즐겨찾기 · 더보기)은 펼친 책 아래 가운데.
// - 펼친 면은 실제 양면이다(좌철이라 오른쪽이 홀수 쪽). 1쪽이면 왼쪽은 표지 안쪽 면지(무지). 페이지는 면을 가장자리까지 채운다.
// - 하드커버 디테일: 표지 판은 종이 밖으로 조금만(표지 무늬 그대로), 가운데 제본선 골, 책등 띠와 접히는 홈 둘(위 · 아래 가장자리에서만 보임),
//   종이 묶음 책등 끝의 머리띠(headband)가 종이 위 · 아래로 조금 비어져 나온다. 닫힌 책은 사용자가 꾸민 표지(고무줄 포함) 그대로.
// - 폰과 세로로 세운 태블릿은 양면이 다 들어오면 너무 작아 가장 최근 쪽 한 면 크기로 맞춘다. 세로 태블릿은 마주 보는 쪽이 화면 끝에 잘려 살짝 보이고 옆 다이어리가 화면 끝에 조금 걸친다. 폰은 한 면만, 옆 책 없이.
// 창빛은 책상에만 비추므로 책 위에는 아무 빛도 얹지 않는다.

const PAPER = '#FAF6EC'; // 속지 종이(아주 살짝 따뜻하게)
const RATIO = { portrait: 768 / 1024, landscape: 1188 / 840 }; // 속지 한 면의 가로 / 세로
const MAX_AREA = 700 * 495; // 종이 한 면의 최대 넓이(px²)
const GAP = 42; // 책과 책 사이
const PEEK = 56; // 옆 다이어리가 적어도 이만큼은 보이게 남기는 폭(가로 다이어리를 펼쳤을 때)
const BLEED = 30; // 태블릿 화면 좌우 여백(libraryGridScroll). 책상은 이 여백까지 넘어 화면 끝까지 쓴다
const SPINE = 20; // 세로 태블릿에서 화면 끝에 걸쳐 보이는 옆 다이어리 폭
const PAGE_EDGE = 24; // 세로 태블릿에서 가운데 한 면과 화면 끝 사이 최소 폭(마주 보는 쪽 · 옆 책등이 보일 자리)
// 세로 태블릿 스와이프 보기에서 가운데 카드 중심이 이 영역 가운데보다 올라간 거리(실기기에서 두 보기를 겹쳐 맞춘 값)
// (carouselShellPortrait 아래 여백을 바꾸면 그 절반만큼 같이 바꾼다: 여백 120 → 79)
const SWIPE_CENTER_UP = 79;
const CAPTION = 64; // 기준선 아래 캡션 자리
const REACH = 3; // 펼친 다이어리 앞뒤로 그려 두는 닫힌 권수
const SWIPE = 36; // 이만큼 밀리면(손을 떼기 전이라도) 옆 다이어리를 펼친다
const FLICK = 0.3; // 이보다 빠르게(px/ms) 튕기고 놓으면 SWIPE 보다 덜 밀었어도 넘긴다
const FLICK_MIN = 16; // 튕기기로 치는 가장 짧은 거리(톡 친 것과 구분)
const SHADOW = '0 8px 16px rgba(11,23,102,0.12)';

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

/** k 번째가 펼쳐졌을 때의 배치: 펼친 책 자리(left · width)와 닫힌 책마다의 왼쪽 끝 x */
function layoutAt(k, sizes, width, compact) {
  const openWidth = sizes[k].half * (compact ? 1 : 2);
  const openLeft = Math.round((width - openWidth) / 2);
  const xs = [];
  let x = openLeft + openWidth + GAP;
  for (let j = k + 1; j < sizes.length; j += 1) { xs[j] = x; x += sizes[j].half + GAP; }
  x = openLeft - GAP;
  for (let j = k - 1; j >= 0; j -= 1) { xs[j] = x - sizes[j].half; x = xs[j] - GAP; }
  return { openLeft, openWidth, xs };
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
  const value = { pages: doc?.pages ?? [], spread: spreadOf(doc?.pages) };
  if (saved) spreads.set(saved, value); else fallbacks.set(diary, value);
  return value;
}
/** 메모리에 이미 읽어 둔 문서가 있으면 기다리지 않고 바로 펼침면을, 아직이면 undefined */
function peekSpread(diary) {
  const peek = diary ? peekEditorDoc(editorDocKey(diary)) : null;
  return peek ? spreadFrom(diary, peek.doc) : undefined;
}
/** 펼침면에 보이는 쪽들의 속지 그림을 미리 해석해 둔다(그릴 때 기다리지 않게) */
function prefetchSpread(value) {
  const { spread, pages } = value ?? {};
  if (!spread) return;
  [spread.left, spread.right, pages[spread.latest - 1]].forEach(page => { if (page && typeof page === 'object') prefetchPageTemplate(page); });
}
/**
 * 옆 다이어리(앞뒤 한 권씩 포함)의 문서와 속지를 미리 읽어 둔다. 다른 보기(스와이프 · 한눈에)에서도 불러
 * 펼쳐서 보기로 넘어온 그 순간에 속지가 이미 그려지게 한다.
 */
export function preloadOpenBooks(diaries, index) {
  [index - 1, index, index + 1].forEach(at => {
    const diary = diaries?.[at];
    if (diary) loadEditorDoc(diary).then(saved => prefetchSpread(spreadFrom(diary, saved))).catch(() => {});
  });
}

function useSpread(diary) {
  // 메모리에 있으면 첫 그림부터 바로 쓴다(빈 종이로 한 번 그렸다가 바뀌지 않게)
  const [state, setState] = useState(() => ({ id: diary?.id, value: peekSpread(diary) }));
  if (diary && state.id !== diary.id) setState({ id: diary.id, value: peekSpread(diary) });
  const ready = state.id === diary?.id && state.value !== undefined;
  useEffect(() => {
    if (!diary || ready) return undefined;
    let alive = true;
    loadEditorDoc(diary)
      .then(saved => { if (alive) setState({ id: diary.id, value: spreadFrom(diary, saved) }); })
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

/** 펼침 자리의 다이어리: 표지 판(종이 밖으로 보이는 가장자리) · 양면 · 책등 · 머리띠 · 제본선 골 · 캡션 */
function OpenBook({ diary, size, left: placed, top, shown, compact, peek = null, shadow, onOpen, onFavorite, onEdit, onDelete, onShare }) {
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
  const page = side => (!spread ? null : compact ? loaded.pages[spread.latest - 1] : spread[side]);
  // 세로로 세운 태블릿(peek = 화면 가운데 x): 양면을 그대로 펼치되 가장 최근 쪽을 화면 가운데에 두고, 마주 보는 쪽은 화면 끝에 잘려 살짝 보인다.
  // 좌철이라 홀수 쪽은 오른쪽 면, 짝수 쪽은 왼쪽 면. 캡션은 화면 가운데에 둔다.
  const left = peek == null ? placed : Math.round(peek - (spread && spread.latest % 2 === 0 ? half / 2 : half * 1.5));
  // 이름 줄은 책 전체 폭에 맞춘다. 세로 태블릿은 책이 화면 밖으로 나가므로 화면 가운데에 놓인 한 면의 폭에 맞춘다.
  const railWidth = peek == null ? width : leaf.width;
  const captionLeft = peek == null ? 0 : peek - left - leaf.width / 2;
  const act = fn => () => { setMenu(null); fn?.(); };
  const manage = diary.canManage !== false;
  const actions = [
    manage && { id: 'edit', label: `${diary.title} 수정`, text: '수정', icon: 'edit', disabled: !onEdit || diary.canEdit === false, onPress: act(() => onEdit?.(diary)) },
    onShare && { id: 'share', label: `${diary.title} 공유`, text: '공유', icon: 'share', onPress: act(() => onShare(diary)) },
    manage && diary.canDelete !== false && { id: 'trash', label: `${diary.title} 휴지통으로 이동`, text: '휴지통으로 이동', icon: 'trash', disabled: !onDelete, onPress: act(() => onDelete?.(diary)) },
  ].filter(Boolean);

  return (
    <View pointerEvents={shown ? 'auto' : 'none'} accessibilityElementsHidden={!shown} importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      style={[styles.book, { left: devicePx(left), top: devicePx(top), width, height: height + CAPTION, opacity: shown ? 1 : 0 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${diary.title} 열기`} onPress={() => onOpen(diary)}
        style={[styles.board, { width, height, borderRadius: radius, backgroundColor: tone, paddingVertical: board.top, boxShadow: shadow },
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
          compact ? { left: 0, width: 10, backgroundImage: 'linear-gradient(to right, rgba(11,23,102,0.12), rgba(11,23,102,0))' }
            : { left: width / 2 - 20, width: 40, backgroundImage: 'linear-gradient(to right, rgba(11,23,102,0) 0%, rgba(11,23,102,0.07) 38%, rgba(11,23,102,0.16) 50%, rgba(11,23,102,0.07) 62%, rgba(11,23,102,0) 100%)' }]} />
      </Pressable>
      {/* 이름 줄: 한눈에 · 스와이프 카드와 같은 구조 — 책 왼쪽 끝에 맞춘 이름 · 쪽수 두 줄, 오른쪽 끝에 별 · ⋯. 카드 · 테두리 없이 글자만
          (별은 판 위가 아니라 줄 안: 판 가장자리는 6~8px 뿐이라 별이 사용자의 속지 위에 놓인다) */}
      <View style={[styles.caption, { width: railWidth, left: captionLeft, top: height + 10 }]}>
        <View style={styles.captionText}>
          <Text numberOfLines={1} style={s.cardTitle}>{diary.title}</Text>
          {spread && <Text style={s.cardPageCount}>{compact ? `${spread.latest} / ${spread.total}` : spread.label}</Text>}
        </View>
        <View style={styles.captionTools}>
          {onFavorite && <Pressable accessibilityRole="button" accessibilityLabel={diary.favorite ? `${diary.title} 즐겨찾기 해제` : `${diary.title} 즐겨찾기`}
            accessibilityState={{ selected: !!diary.favorite }} onPress={() => onFavorite(diary)} hitSlop={10}>
            <FavoriteStar filled={!!diary.favorite} outline={captionInk} size={22} />
          </Pressable>}
          {actions.length > 0 && <Pressable ref={moreRef} accessibilityRole="button" accessibilityLabel={`${diary.title} 더보기`} accessibilityState={{ expanded: menu !== null }} hitSlop={10}
            onPress={() => {
              const node = moreRef.current;
              if (node?.measureInWindow) node.measureInWindow((mx, my, w, h) => setMenu({ anchor: { x: mx, y: my, width: w, height: h + PAGE_COUNT_ROW } })); // 말풍선이 이름 밑 쪽수 줄을 가리지 않게 그만큼 아래에 연다(DiaryCard 와 같은 값)
              else setMenu({ anchor: null });
            }}>
            <AppIcon name="more" size={22} color={captionInk} />
          </Pressable>}
        </View>
      </View>
      {menu && <DiaryActionBubble anchor={menu.anchor} title={diary.title} actions={actions} onClose={() => setMenu(null)} />}
    </View>
  );
}

/** 닫힌 다이어리: 사용자가 꾸민 표지 그대로(고무줄 포함). 누르면 그 다이어리를 펼친다 */
const ClosedBook = memo(function ClosedBook({ diary, size, top, left, side, shadow, onPick }) {
  const cover = useMemo(() => normalizeCover(diary), [diary]);
  const { half, height, scale } = size;
  const coverShadow = useMemo(() => ({ boxShadow: shadow }), [shadow]);
  return (
    <View style={[styles.book, { left, top, width: half, height }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${side === 'left' ? '이전' : '다음'} 다이어리 ${diary.title} 펼치기`} onPress={onPick} style={StyleSheet.absoluteFill}>
        {cover.enabled ? <CoverArt cover={cover} name={diary.title} width={half} height={height} shadow={coverShadow} />
          : <View style={[StyleSheet.absoluteFill, styles.noCover, { borderRadius: Math.round(14 * scale), boxShadow: shadow }]}><Text numberOfLines={2} style={styles.noCoverTitle}>{diary.title}</Text></View>}
      </Pressable>
    </View>
  );
});

function OpenBookShelf({ diaries, index, onIndexChange, onOpen, onFavorite, onEdit, onDelete, onShare, compact = false }) {
  // 지난번에 잰 크기로 바로 그린다(다른 보기에서 넘어올 때 크기를 재는 한 프레임 동안 비어 있지 않게). 다르면 onLayout 이 고친다.
  const [area, setArea] = useState(() => lastArea);
  // 한 면만(가장 최근 쪽, 옆 책 없이): 폰과 세로로 세운 태블릿. 펼친 양면이 너무 작아진다
  // 세로로 세운 태블릿은 가장 최근 쪽 한 면을 가운데에, 마주 보는 쪽은 화면 끝에 잘려 살짝 보이고 옆 다이어리는 화면 끝에 조금만 걸친다. 폰은 한 면만.
  const upright = area != null && area.height > area.width;
  const single = compact || upright;
  const current = useSpread(diaries[index]); // 펼친 다이어리의 펼침면(세로 태블릿에서 어느 쪽 면이 걸치는지)

  // 축척: 세로 · 가로 어느 다이어리가 와도 같은 값이 되도록 두 방향을 함께 맞춘다(바뀌어도 종이 크기가 같게).
  // 가로 펼침은 폭(옆 다이어리가 PEEK 만큼 보일 자리를 남기고), 세로 펼침은 높이(캡션 자리를 남기고)에 맞춘다. 폰은 한 면만.
  const layout = useMemo(() => {
    if (!area) return null;
    const room = { width: area.width - (compact ? 32 : 2 * (BLEED + GAP + PEEK)), height: area.height - CAPTION - (compact ? 16 : 24) };
    const tall = !compact && area.height > area.width;
    const pairs = compact || tall ? 1 : 2;
    const byWidth = Math.min(...[RATIO.portrait, RATIO.landscape].map(r => (room.width / pairs / 1.03) ** 2 / r));
    const byHeight = Math.min(...[RATIO.portrait, RATIO.landscape].map(r => (room.height / 1.02) ** 2 * r));
    // 세로 태블릿: 스와이프 보기의 카드가 세로에서 커지는 만큼(cardCarousel → cardCarouselLarge) 종이도 같은 비율로 키운다.
    // 다만 가장 넓은 가로 다이어리 한 면이 화면 폭 안(양끝 PAGE_EDGE 는 마주 보는 쪽 · 옆 책등 자리)에 들어오는 데까지만.
    const grow = tall ? (s.cardCarouselLarge.width / s.cardCarousel.width) ** 2 : 1;
    const fit = tall ? ((area.width - 2 * PAGE_EDGE) / 1.03) ** 2 / RATIO.landscape : Infinity;
    const paper = Math.min(MAX_AREA * grow, byWidth * grow, fit, byHeight);
    // 기준선: 가장 키가 큰 펼침(세로)의 아랫변. 가로 다이어리는 그 위에 낮게 놓여 남는 위쪽은 상판으로 보인다.
    return { paper, base: Math.round(8 + leafOf(paper, RATIO.portrait).height * 1.02), width: area.width };
  }, [area, compact]);
  const sizes = useMemo(() => (layout ? diaries.map(diary => bookSize(diary, layout.paper)) : []), [diaries, layout]);
  // 앞뒤 다이어리의 속지 그림도 미리 해석해 둔다(숨겨 그려 둔 옆 책이 넘기는 순간 다 그려져 있게)
  useEffect(() => { preloadOpenBooks(diaries, index); }, [diaries, index]);
  const settled = useDeferredValue(index);
  const shadow = SHADOW;

  // 끄는 동안에는 아무것도 움직이지 않는다. 손을 떼기를 기다리지 않고 SWIPE 만큼 밀린 그 순간 바로 옆 다이어리로 바뀐다(한 번 끌기에 한 권).
  // 짧게 튕긴 손짓(FLICK 속도 이상)은 덜 밀었어도 놓을 때 넘긴다. 좌우 화살표 · 옆 책을 눌러도 같다.
  const goRef = useRef(null);
  goRef.current = step => { const next = index + step; if (next >= 0 && next < diaries.length) onIndexChange(next); };
  const pan = useMemo(() => {
    let turned = false;
    const turn = step => { if (!turned) { turned = true; goRef.current(step); } };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => { turned = false; },
      onPanResponderMove: (_, g) => { if (g.dx <= -SWIPE) turn(1); else if (g.dx >= SWIPE) turn(-1); },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) < FLICK_MIN || Math.abs(g.vx) < FLICK) return;
        turn(g.dx < 0 ? 1 : -1);
      },
    });
  }, []);

  if (!diaries[index]) return null;
  let view = null;
  if (layout && sizes.length) {
    const now = layoutAt(index, sizes, layout.width, single);
    const closed = [];
    if (!single) {
      for (let at = Math.max(0, index - REACH); at <= Math.min(diaries.length - 1, index + REACH); at += 1) {
        if (at === index) continue;
        closed.push(<ClosedBook key={diaries[at].id} diary={diaries[at]} size={sizes[at]} top={layout.base - sizes[at].height} side={at < index ? 'left' : 'right'} shadow={shadow}
          left={now.xs[at]} onPick={() => onIndexChange(at)} />);
      }
    }
    // 바로 옆 두 권도 펼친 모습으로 미리 그려 두고 숨긴다. 넘기면 같은 그림을 보이게만 해서 넘긴 순간 속지가 이미 다 그려져 있다.
    // 새로 옆이 된 책은 넘긴 뒤 한 박자 늦게(deferred) 그린다. 넘기는 그 순간에는 이미 그려 둔 책을 보이게만 해 바로 바뀐다.
    const near = new Set([settled - 1, settled, settled + 1, index]);
    const opened = [...near].sort((a, b) => a - b).filter(at => diaries[at] && Math.abs(at - index) <= 1).map(at => (
      <OpenBook key={diaries[at].id} shown={at === index} diary={diaries[at]} size={sizes[at]} left={layoutAt(at, sizes, layout.width, single).openLeft}
        top={layout.base - sizes[at].height} compact={compact} peek={upright && !compact ? Math.round(layout.width / 2) : null} shadow={shadow} onOpen={onOpen} onFavorite={onFavorite} onEdit={onEdit} onDelete={onDelete} onShare={onShare} />
    ));
    // 세로 태블릿: 옆 다이어리는 화면 끝에 책등 쪽만 SPINE 만큼 걸쳐(펼친 책 가장자리 위에 얹혀) 옆으로 넘길 수 있음을 보여 준다
    // 마주 보는 쪽이 걸쳐 보이는 쪽에는 두지 않는다(홀수 쪽이면 왼쪽 면이, 짝수 쪽이면 오른쪽 면이 걸친다)
    // (폰은 한 면만 보여 마주 보는 쪽이 없다: 양옆 책등을 모두 걸친다. 마주 보는 쪽 · 가운데 맞춤(peek)은 세로 태블릿 계산이다)
    const facing = compact ? 0 : current?.spread && current.spread.latest % 2 === 0 ? 1 : -1;
    const edges = upright ? [index - 1, index + 1].filter(at => diaries[at] && Math.sign(at - index) !== facing).map(at => (
      <ClosedBook key={diaries[at].id} diary={diaries[at]} size={sizes[at]} top={layout.base - sizes[at].height} side={at < index ? 'left' : 'right'} shadow={shadow}
        left={at < index ? SPINE - sizes[at].half : layout.width - SPINE} onPick={() => onIndexChange(at)} />
    )) : null;
    view = <>
      {closed}
      {opened}
      {edges}
    </>;
  }
  // 세로 태블릿은 가장 키 큰 펼침(세로 다이어리)의 가운데를 스와이프 보기 가운데 카드의 가운데와 같은 높이에 둔다.
  // 펼친 다이어리마다 따로 맞추면 넘길 때 기준선 · 캡션 · 옆 책이 함께 오르내려, 모든 다이어리에 같은 값을 쓴다(아랫변은 늘 한 기준선).
  const tallest = layout ? bookSize({ templateConfig: { orientation: 'portrait' } }, layout.paper).height : 0;
  const lift = layout && upright
    ? Math.max(0, Math.min(area.height - layout.base - CAPTION, Math.round(area.height / 2 - SWIPE_CENTER_UP - layout.base + tallest / 2)))
    : 0;

  return (
    // 잰 크기는 정수로 내리고 1px 넘게 달라질 때만 바꾼다. 소수점 크기를 그대로 쓰면 책 크기 → 배치 반올림 → 다시 잰 크기가 오가며 책이 떨렸다.
    // 태블릿은 화면 여백(BLEED)까지 넘어 좌우 끝까지 책상으로 쓴다(옆 다이어리가 여백 선에서 잘리지 않게)
    <View style={[styles.area, !compact && styles.bleed]} {...pan.panHandlers} onLayout={event => {
      const w = Math.floor(event.nativeEvent.layout.width), h = Math.floor(event.nativeEvent.layout.height);
      setArea(current => {
        const next = current && Math.abs(current.width - w) <= 1 && Math.abs(current.height - h) <= 1 ? current : { width: w, height: h };
        lastArea = next;
        return next;
      });
    }}>
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { top: lift, bottom: -lift }]}>{view}</View>
      {/* 좌우 화살표: 스와이프 보기와 같은 모양 · 자리(화면 여백 안쪽), 높이는 가장 키 큰 펼침의 가운데.
          책 · 속지 위에 겹쳐도 보이도록 같은 화살표를 상판 바탕색으로 굵게 한 번 더 깔아 윤곽을 두른다 */}
      {layout && !compact && [[-1, 'left'], [1, 'right']].filter(([step]) => diaries[index + step]).map(([step, side]) => (
        <Pressable key={side} accessibilityRole="button" accessibilityLabel={step < 0 ? '이전 다이어리' : '다음 다이어리'} onPress={() => goRef.current(step)}
          style={[s.carouselArrow, { top: lift + layout.base - tallest / 2 - 24, [side]: BLEED + 4 }]}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={styles.arrowHalo}><AppIcon name={`chevron-${side}`} size={24} color={DESK_COLOR} strokeWidth={6.5} /></View>
          </View>
          <AppIcon name={`chevron-${side}`} size={24} color={C.ink} strokeWidth={2.1} />
        </Pressable>
      ))}
    </View>
  );
}

export default memo(OpenBookShelf);

const styles = StyleSheet.create({
  area: { flex: 1, minHeight: 420, overflow: 'hidden' },
  bleed: { marginHorizontal: -BLEED },
  arrowHalo: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  book: { position: 'absolute', left: 0 },
  board: { flexDirection: 'row', boxShadow: SHADOW },
  clip: { overflow: 'hidden' },
  leaf: { backgroundColor: PAPER, overflow: 'hidden' },
  // 종이 모서리는 거의 각지고(4), 제본선 쪽은 각지다
  leftLeaf: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  rightLeaf: { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  // 책등 띠는 빛을 덜 받아 조금 어둡고, 홈은 더 어둡다. 오른쪽에 얇은 밝은 선을 둬 접힌 골처럼 보인다
  spineBand: { position: 'absolute', backgroundColor: 'rgba(11,23,102,0.08)' },
  outline: { borderWidth: 1, borderColor: 'rgba(17,33,106,0.12)' },
  groove: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(11,23,102,0.18)', boxShadow: '1px 0 0 rgba(255,255,255,0.3)' },
  headband: { position: 'absolute', flexDirection: 'row', overflow: 'hidden' },
  gutter: { position: 'absolute' },
  noCover: { backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center', padding: 16, boxShadow: SHADOW },
  noCoverTitle: { color: C.ink, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  // 이름 줄: DiaryCard 의 cardInfoGrid(위 10 · 좌우 4)와 같은 여백, 별 · ⋯ 는 cardMoreSlot 처럼 이름 첫 줄에 맞춘다
  caption: { position: 'absolute', left: 0, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, paddingHorizontal: 4 },
  captionText: { flex: 1, minWidth: 0 },
  captionTools: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: -1 },
});
