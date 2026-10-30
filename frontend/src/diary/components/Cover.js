import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { styles as s } from '../styles';
import CoverArt from './CoverArt';
import { TemplatePreview } from './PaperOptions';
import { normalizeCover } from '../utils/coverDesign';
import { configuredPageIds } from '../../editor/templates/creation.js';
import { normalizeOrientation, templateCanvasSize } from '../../editor/templates/catalog.js';
import { C } from '../constants';
import { coverShadowAt } from '../utils/deskShadow';
import { LAMP_PATCH, deskLightAt } from '../utils/deskLight';
import { coverLightAt } from '../utils/coverLight';
import { useDeskHour } from '../utils/deskTimeStore';
import { carouselFollowNodes, carouselRestAt, followOffset } from '../utils/carouselFollow';
import { useRailMoving } from '../utils/railMotion';
import { maskFrame, useDeskGeometry, useDeskLayoutTick } from '../utils/deskMask';

// fill 표지는 이 크기(긴 변)로 한 번만 그리고, 칸 폭에 맞춰 크기 변환(scale)으로 늘리고 줄인다 (패턴 · 글자를 다시 그리지 않는다)
const ART_LONG_SIDE = 219

// 표지는 세로 3:4, 가로 4:3
const COVER_RATIO = { portrait: 3 / 4, landscape: 4 / 3 };

function firstPageId(diary) {
  try { return configuredPageIds(diary.templateConfig)[0] ?? null; } catch { return null; }
}

/**
 * 목록 · 휴지통 · 공유 화면의 다이어리 표지.
 * 칸 크기는 화면마다 정해져 있고, 그 안에 다이어리 방향대로 그린다 (선반 배치):
 * 세로 · 가로 모두 긴 변을 칸의 짧은 변에 맞춰 같은 크기로 보이고, 칸 아래에 맞춘다. 표지가 없으면 첫 속지를 그 방향대로 보인다.
 * sunShadow: 책상 위 표지의 그림자를 햇빛(달빛) 방향 · 길이에 맞춘다(아침엔 오른쪽, 정오엔 아래, 저녁엔 왼쪽으로 지고 해가 낮을수록 길다).
 * fill: 칸을 고정 높이(219) 대신 부모 폭에 맞춘다(최대 219). 좁은 카드 밖으로 칸이 넘치지 않는다. centered: 표지를 칸 위아래 가운데에 둔다.
 * children(펜 · 별 버튼 등)은 칸이 아니라 실제 표지 위에 얹는다.
 */
function Cover({ thumbnailWidth, diary, small = false, preview = false, carousel = false, grid = false, compact = false, large = false, fill = false, centered = false, sunShadow = false, lightMotion = null, children }) {
  const frame = StyleSheet.flatten([s.cover, small && s.coverSmall, carousel && s.coverCarousel, compact && carousel && s.coverCarouselCompact, large && carousel && s.coverCarouselLarge, grid && s.coverGrid, compact && grid && s.coverGridCompact, preview && s.bookPreview, fill && styles.fill]);
  // 칸 크기: 고정 칸은 스타일 값으로 첫 프레임부터 맞게 그리고, 반응형 칸(격자 · 목록)은 실제 크기를 재서 다시 맞춘다.
  const styleWidth = thumbnailWidth ?? (preview ? s.bookPreview.width : small ? s.coverSmall.width
    : carousel ? (large ? s.cardCarouselLarge.width : compact ? s.cardCarouselCompact.width : s.cardCarousel.width) : s.bookPreview.width);
  const styleHeight = thumbnailWidth ? thumbnailWidth * 246 / 185 : typeof frame.height === 'number' ? frame.height : frame.aspectRatio ? styleWidth / frame.aspectRatio : styleWidth * 246 / 185;
  const [measured, setMeasured] = useState(null);
  // 사이드 메뉴가 움직이는 동안은 칸 폭이 프레임마다 바뀌므로 다시 재지 않고, 멈춘 뒤 마지막 크기로 한 번만 맞춘다.
  const railMoving = useRailMoving();
  const pendingSize = useRef(null);
  const cellWidth = measured?.width || styleWidth, cellHeight = measured?.height || styleHeight;
  useEffect(() => {
    if (railMoving || !pendingSize.current) return;
    const next = pendingSize.current; pendingSize.current = null;
    setMeasured(current => (current && Math.round(current.width) === Math.round(next.width) && Math.round(current.height) === Math.round(next.height) ? current : next));
  }, [railMoving]);
  const cover = useMemo(() => normalizeCover(diary), [diary]);
  const orientation = normalizeOrientation(diary.templateConfig?.orientation ?? diary.pageSize);
  const pageId = useMemo(() => (cover.enabled ? null : firstPageId(diary)), [cover.enabled, diary]);
  const ratio = cover.enabled ? COVER_RATIO[orientation] : (() => { const { width, height } = templateCanvasSize(orientation); return width / height; })();
  // 세로 · 가로가 같은 크기로 보이도록 긴 변을 칸의 짧은 변에 맞춘다 (가로는 세로 표지를 돌려 놓은 크기)
  const longSide = Math.min(cellWidth, cellHeight);
  const boxWidth = ratio < 1 ? longSide * ratio : longSide;
  const boxHeight = ratio < 1 ? longSide : longSide / ratio;
  const artWidth = ratio < 1 ? ART_LONG_SIDE * ratio : ART_LONG_SIDE, artHeight = ratio < 1 ? ART_LONG_SIDE : ART_LONG_SIDE / ratio
  const hour = useDeskHour(sunShadow)
  // shadow · light 는 같은 값이면 같은 객체를 넘긴다. 매번 새 객체를 만들면 memo 인 CoverArt 가 값이 같아도 다시 그려져 패턴(SVG)까지 새로 그려진다.
  const { boxShadow, shadowOpacity, shadowColor, shadowRadius, elevation } = frame, shadowOffset = frame.shadowOffset
  const shadow = useMemo(() => sunShadow && hour != null && (frame.boxShadow || frame.shadowOpacity) ? { boxShadow: coverShadowAt(hour, Boolean(frame.boxShadow), deskLightAt(hour).lamp) } : frame.boxShadow ? { boxShadow: frame.boxShadow } : frame.shadowOpacity ? { shadowColor: frame.shadowColor, shadowOpacity: frame.shadowOpacity, shadowRadius: frame.shadowRadius, shadowOffset: frame.shadowOffset, elevation: frame.elevation } : null, [sunShadow, hour, boxShadow, shadowOpacity, shadowColor, shadowRadius, elevation, shadowOffset?.width, shadowOffset?.height]);
  // 책상 위 표지(sunShadow)는 책상 빛을 받는다.
  const light = useMemo(() => sunShadow && hour != null ? coverLightAt(hour) : null, [sunShadow, hour]);
  const sx = Math.min(boxWidth, boxHeight) / s.bookPreview.width;
  // 표지 위에도 책상과 같은 창빛 마스크를 같은 자리에 비춘다(십자 창살 자리는 빛이 들지 않는다).
  // 카드가 쉬는 동안 표지 왼쪽 위 좌표를 한 번 재서 스크롤과 무관한 기준(anchor)을 만들고, 카드를 넘기는 동안에는 스크롤 값으로 마스크 자리를 매 프레임 따라간다.
  const desk = useDeskGeometry();
  const layoutTick = useDeskLayoutTick();
  const box = useRef(null);
  const [origin, setOrigin] = useState(null);
  // 쉬는 위치(rest)는 잰 순간의 값을 함께 저장한다. 기준(anchor)은 스크롤과 무관하므로 카드를 넘길 때마다 다시 잴 필요가 없다 —
  // 넘기는 중에 다시 재면 움직이는 자리를 기준으로 잡아 마스크가 튄다. 다시 재는 건 책상 · 칸 크기가 바뀔 때뿐이다.
  const motionRef = useRef(lightMotion);
  motionRef.current = lightMotion;
  const measure = useCallback(() => box.current?.measureInWindow?.((x, y) => {
    const rest = motionRef.current?.rest;
    if (rest != null) setOrigin(prev => prev && prev.rest === rest && Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5 ? prev : { x, y, rest });
  }), []);
  useEffect(() => { if (light && desk && lightMotion) measure(); }, [light != null, desk, layoutTick, measure, boxWidth, boxHeight, lightMotion != null]);
  // 가로 표지는 칸 아래에 붙어 카드 맨 위에서 q 만큼 내려와 있다
  // centered 표지는 칸 가운데에 놓여 위쪽 여백이 남는 높이의 절반이다
  const q = Math.max(0, cellHeight - boxHeight) / (centered ? 2 : 1);
  const windowMask = useMemo(() => {
    if (!light || !desk || !origin || !lightMotion) return null;
    const rest = carouselRestAt(lightMotion.index, origin.rest, lightMotion.step);
    const anchor = { cx: origin.x + boxWidth * rest.scale / 2 + origin.rest, yc: origin.y - rest.lift - q * rest.scale };
    const nodes = carouselFollowNodes(lightMotion.scrollX, lightMotion.index, lightMotion.step);
    const lit = deskLightAt(hour);
    const place = patch => {
      const f = maskFrame(patch, desk, desk.compact);
      return { width: f.width, height: f.height, transform: f.transform, offset: followOffset(nodes, anchor, boxWidth, q, desk.x + f.left, desk.y + f.top) };
    };
    return { lit, inverse: nodes.inverse, sun: place(lit.patch), lamp: place({ x: LAMP_PATCH.patch[0], y: LAMP_PATCH.patch[1], scaleX: LAMP_PATCH.patch[2], scaleY: LAMP_PATCH.patch[3], skewX: LAMP_PATCH.patch[4], rotate: LAMP_PATCH.patch[5] }) };
  }, [light != null, desk, origin, hour, lightMotion?.scrollX, lightMotion?.index, lightMotion?.step, boxWidth, q]);
  // 칸이 정사각형인 격자 표지(fill + grid)는 표지 칸을 퍼센트 + 가로세로 비율로 레이아웃에 맡기고, 그림 배율만 칸이 바뀔 때마다 ref 로 직접 바꾼다.
  // 사이드 메뉴가 움직이는 동안에도 상태 · 다시 그리기 없이 칸과 함께 매 프레임 같이 커지고 작아진다.
  const liveFill = cover.enabled && fill && grid;
  const art = useRef(null);
  const onBoxLayout = useCallback(event => {
    const { width } = event.nativeEvent.layout;
    if (width > 0) art.current?.setNativeProps?.({ style: { transform: [{ scale: width / artWidth }] } });
  }, [artWidth]);
  return (
    <View
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        if (measured && railMoving) { pendingSize.current = { width, height }; return; }
        pendingSize.current = null;
        if (Math.round(width) !== Math.round(measured?.width ?? -1) || Math.round(height) !== Math.round(measured?.height ?? -1)) setMeasured({ width, height });
      }}
      // fill: 폭을 재기 전의 첫 그림은 짐작한 크기라 달라 보이므로, 잰 뒤에 한 번에 보인다.
      style={[frame, styles.cell, centered && styles.fillCenter, fill && !measured && styles.unmeasured, thumbnailWidth && { width: thumbnailWidth, height: styleHeight, minHeight: 0 }]}>
      <View ref={box} collapsable={false} onLayout={liveFill ? onBoxLayout : undefined} style={liveFill ? { width: ratio < 1 ? `${ratio * 100}%` : '100%', aspectRatio: ratio } : { width: boxWidth, height: boxHeight }}>
        {cover.enabled && fill ? <View ref={art} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: artWidth, height: artHeight, transform: [{ scale: boxWidth / artWidth }], transformOrigin: 'top left' }}>
          <CoverArt cover={cover} name={diary.title} width={artWidth} height={artHeight} shadow={shadow} light={light} windowMask={windowMask} />
        </View>
          : cover.enabled ? <CoverArt cover={cover} name={diary.title} width={boxWidth} height={boxHeight} shadow={shadow} light={light} windowMask={windowMask} />
          : <View style={[styles.page, { borderRadius: 4 * sx }, shadow]}>
            {pageId ? <TemplatePreview assetId={pageId} width={boxWidth} appearance={diary.paperAppearance} style={styles.pagePreview} /> : null}
            <Text style={[styles.noCover, { fontSize: Math.max(9, 9 * sx), margin: 8 * sx }]}>표지 없음</Text>
          </View>}
        {children}
      </View>
    </View>
  );
}

export default memo(Cover);

const styles = StyleSheet.create({
  // 칸은 자리만 잡는다. 바탕 · 그림자는 표지(또는 첫 속지)가 그린다.
  // fill: 고정 높이 대신 부모 폭에 맞춘 정사각형 칸 (카드가 219보다 좁아도 표지가 옆 카드를 덮지 않게)
  fill: { width: '100%', maxWidth: 219, height: 'auto' },
  unmeasured: { opacity: 0 },
  fillCenter: { justifyContent: 'center' },
  cell: { padding: 0, overflow: 'visible', justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'transparent', borderRadius: 0, shadowOpacity: 0, elevation: 0, boxShadow: 'none' },
  page: { ...StyleSheet.absoluteFill, backgroundColor: C.white, justifyContent: 'flex-end' },
  pagePreview: { position: 'absolute', top: 0, left: 0, borderWidth: 0 },
  noCover: { alignSelf: 'flex-start', overflow: 'hidden', color: C.inkSoft, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: C.pale },
});
