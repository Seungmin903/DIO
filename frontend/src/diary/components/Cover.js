import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { styles as s } from '../styles';
import CoverArt, { coverBody } from './CoverArt';
import { TemplatePreview } from './PaperOptions';
import { normalizeCover } from '../utils/coverDesign';
import { configuredPageIds } from '../../editor/templates/creation.js';
import { normalizeOrientation, templateCanvasSize } from '../../editor/templates/catalog.js';
import { C } from '../constants';
import { useRailMoving } from '../utils/railMotion';
import { GRID_CELL_MAX } from '../utils/gridLayout';

// fill 표지는 이 크기(긴 변)로 한 번만 그리고, 칸 폭에 맞춰 크기 변환(scale)으로 늘리고 줄인다 (패턴 · 글자를 다시 그리지 않는다)
const ART_LONG_SIDE = GRID_CELL_MAX

// 표지는 세로 3:4, 가로 4:3
const COVER_RATIO = { portrait: 3 / 4, landscape: 4 / 3 };

function firstPageId(diary) {
  try { return configuredPageIds(diary.templateConfig)[0] ?? null; } catch { return null; }
}

/**
 * 목록 · 휴지통 · 공유 화면의 다이어리 표지.
 * 칸 크기는 화면마다 정해져 있고, 그 안에 다이어리 방향대로 그린다 (선반 배치):
 * 세로 · 가로 모두 긴 변을 칸의 짧은 변에 맞춰 같은 크기로 보이고, 칸 아래에 맞춘다. 표지가 없으면 첫 속지를 그 방향대로 보인다.
 * fill: 칸을 고정 높이(219) 대신 부모 폭에 맞춘다(최대 격자 칸 GRID_CELL_MAX). 좁은 카드 밖으로 칸이 넘치지 않는다. centered: 표지를 칸 위아래 가운데에 둔다.
 * children(펜 · 별 버튼 등)은 칸이 아니라 실제 표지 위에 얹는다.
 * frame: 'active' | 'idle' 이면 표지를 감싸는 포커스 프레임(스와이프)을 그린다. 모서리 둥글기는 표지 본체와 같은 계산이라 표지 크기가 달라도 맞는다.
 * onInset(px): 표지가 칸 가운데에 놓여 칸 왼쪽에서 떨어진 만큼(세로 표지는 칸보다 좁다). 이름 · 페이지 수를 표지 왼쪽 끝에 맞출 때 쓴다.
 */
function Cover({ thumbnailWidth, diary, small = false, preview = false, carousel = false, grid = false, compact = false, large = false, fill = false, centered = false, frame: frameTone = null, onInset = null, children }) {
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
  // 칸 가운데에 놓인 표지의 왼쪽 끝(세로 표지는 칸보다 좁다)
  const inset = Math.max(0, Math.round((cellWidth - boxWidth) / 2));
  useEffect(() => { onInset?.(inset); }, [inset, onInset]);
  // 포커스 프레임: 본체(고무줄이 튀어나올 만큼 칸보다 안쪽인 둥근 판)에 틈 없이 붙어 두께만큼 바깥을 감싼다. 칸 가장자리에 두면 본체와의 틈으로 표지 그림자가 흰 테두리 안쪽에 비쳐 보였다.
  // 고무줄 끝은 틈 두께(bandOut ≤ 프레임 두께)만큼만 튀어나와 프레임 아래로 들어간다.
  const ring = frameTone === 'active' ? 3 : 2;
  const body = coverBody(boxWidth, boxHeight);
  const open = cover.enabled ? body : { bandOut: 0, left: 4 * (Math.min(boxWidth, boxHeight) / s.bookPreview.width), right: 4 * (Math.min(boxWidth, boxHeight) / s.bookPreview.width) };
  const frameStyle = frameTone ? [styles.frameBase, frameTone === 'active' ? s.coverFrameActive : s.coverFrameIdle, {
    top: open.bandOut - ring, left: open.bandOut - ring, right: open.bandOut - ring, bottom: open.bandOut - ring,
    borderTopLeftRadius: open.left + ring, borderBottomLeftRadius: open.left + ring, borderTopRightRadius: open.right + ring, borderBottomRightRadius: open.right + ring,
  }] : null;
  // shadow 는 같은 값이면 같은 객체를 넘긴다. 매번 새 객체를 만들면 memo 인 CoverArt 가 값이 같아도 다시 그려져 패턴(SVG)까지 새로 그려진다.
  const { boxShadow, shadowOpacity, shadowColor, shadowRadius, elevation } = frame, shadowOffset = frame.shadowOffset
  const shadow = useMemo(() => boxShadow ? { boxShadow } : shadowOpacity ? { shadowColor, shadowOpacity, shadowRadius, shadowOffset, elevation } : null, [boxShadow, shadowOpacity, shadowColor, shadowRadius, elevation, shadowOffset?.width, shadowOffset?.height]);
  const sx = Math.min(boxWidth, boxHeight) / s.bookPreview.width;
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
      <View onLayout={liveFill ? onBoxLayout : undefined} style={[liveFill ? { width: ratio < 1 ? `${ratio * 100}%` : '100%', aspectRatio: ratio } : { width: boxWidth, height: boxHeight }]}>
        {cover.enabled && fill ? <View ref={art} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: artWidth, height: artHeight, transform: [{ scale: boxWidth / artWidth }], transformOrigin: 'top left' }}>
          <CoverArt cover={cover} name={diary.title} width={artWidth} height={artHeight} shadow={shadow} />
        </View>
          : cover.enabled ? <CoverArt cover={cover} name={diary.title} width={boxWidth} height={boxHeight} shadow={shadow} />
          : <View style={[styles.page, { borderRadius: 4 * sx }, shadow]}>
            {pageId ? <TemplatePreview assetId={pageId} width={boxWidth} appearance={diary.paperAppearance} style={styles.pagePreview} /> : null}
            <Text style={[styles.noCover, { fontSize: Math.max(9, 9 * sx), margin: 8 * sx }]}>표지 없음</Text>
          </View>}
        {frameStyle && <View pointerEvents="none" style={frameStyle} />}
        {children}
      </View>
    </View>
  );
}

export default memo(Cover);

const styles = StyleSheet.create({
  // 칸은 자리만 잡는다. 바탕 · 그림자는 표지(또는 첫 속지)가 그린다.
  // fill: 고정 높이 대신 부모 폭에 맞춘 정사각형 칸 (카드가 좁아도 표지가 옆 카드를 덮지 않게, 넓으면 격자 칸 최대까지 함께 커진다)
  frameBase: { position: 'absolute' },
  fill: { width: '100%', maxWidth: GRID_CELL_MAX, height: 'auto' },
  unmeasured: { opacity: 0 },
  fillCenter: { justifyContent: 'center' },
  cell: { padding: 0, overflow: 'visible', justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'transparent', borderRadius: 0, shadowOpacity: 0, elevation: 0, boxShadow: 'none' },
  page: { ...StyleSheet.absoluteFill, backgroundColor: C.white, justifyContent: 'flex-end' },
  pagePreview: { position: 'absolute', top: 0, left: 0, borderWidth: 0 },
  noCover: { alignSelf: 'flex-start', overflow: 'hidden', color: C.inkSoft, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: C.pale },
});
