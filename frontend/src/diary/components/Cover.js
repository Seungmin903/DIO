import { memo, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { styles as s } from '../styles';
import CoverArt from './CoverArt';
import { TemplatePreview } from './PaperOptions';
import { normalizeCover } from '../utils/coverDesign';
import { configuredPageIds } from '../../editor/templates/creation.js';
import { normalizeOrientation, templateCanvasSize } from '../../editor/templates/catalog.js';
import { C } from '../constants';

// 표지는 세로 3:4, 가로 4:3
const COVER_RATIO = { portrait: 3 / 4, landscape: 4 / 3 };

function firstPageId(diary) {
  try { return configuredPageIds(diary.templateConfig)[0] ?? null; } catch { return null; }
}

/**
 * 목록 · 휴지통 · 공유 화면의 다이어리 표지.
 * 칸 크기는 화면마다 정해져 있고, 그 안에 다이어리 방향대로 그린다 (선반 배치):
 * 세로 · 가로 모두 긴 변을 칸의 짧은 변에 맞춰 같은 크기로 보이고, 칸 아래에 맞춘다. 표지가 없으면 첫 속지를 그 방향대로 보인다.
 * children(펜 · 별 버튼 등)은 칸이 아니라 실제 표지 위에 얹는다.
 */
function Cover({ thumbnailWidth, diary, small = false, preview = false, carousel = false, grid = false, compact = false, children }) {
  const frame = StyleSheet.flatten([s.cover, small && s.coverSmall, carousel && s.coverCarousel, compact && carousel && s.coverCarouselCompact, grid && s.coverGrid, compact && grid && s.coverGridCompact, preview && s.bookPreview]);
  // 칸 크기: 고정 칸은 스타일 값으로 첫 프레임부터 맞게 그리고, 반응형 칸(격자 · 목록)은 실제 크기를 재서 다시 맞춘다.
  const styleWidth = thumbnailWidth ?? (preview ? s.bookPreview.width : small ? s.coverSmall.width
    : carousel ? (compact ? s.cardCarouselCompact.width : s.cardCarousel.width) : s.bookPreview.width);
  const styleHeight = thumbnailWidth ? thumbnailWidth * 246 / 185 : typeof frame.height === 'number' ? frame.height : frame.aspectRatio ? styleWidth / frame.aspectRatio : styleWidth * 246 / 185;
  const [measured, setMeasured] = useState(null);
  const cellWidth = measured?.width || styleWidth, cellHeight = measured?.height || styleHeight;
  const cover = useMemo(() => normalizeCover(diary), [diary]);
  const orientation = normalizeOrientation(diary.templateConfig?.orientation ?? diary.pageSize);
  const pageId = useMemo(() => (cover.enabled ? null : firstPageId(diary)), [cover.enabled, diary]);
  const ratio = cover.enabled ? COVER_RATIO[orientation] : (() => { const { width, height } = templateCanvasSize(orientation); return width / height; })();
  // 세로 · 가로가 같은 크기로 보이도록 긴 변을 칸의 짧은 변에 맞춘다 (가로는 세로 표지를 돌려 놓은 크기)
  const longSide = Math.min(cellWidth, cellHeight);
  const boxWidth = ratio < 1 ? longSide * ratio : longSide;
  const boxHeight = ratio < 1 ? longSide : longSide / ratio;
  const shadow = frame.shadowOpacity ? { shadowColor: frame.shadowColor, shadowOpacity: frame.shadowOpacity, shadowRadius: frame.shadowRadius, shadowOffset: frame.shadowOffset, elevation: frame.elevation } : null;
  const sx = Math.min(boxWidth, boxHeight) / s.bookPreview.width;
  return (
    <View
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        if (Math.round(width) !== Math.round(measured?.width ?? -1) || Math.round(height) !== Math.round(measured?.height ?? -1)) setMeasured({ width, height });
      }}
      style={[frame, styles.cell, thumbnailWidth && { width: thumbnailWidth, height: styleHeight, minHeight: 0 }]}>
      <View style={{ width: boxWidth, height: boxHeight }}>
        {cover.enabled ? <CoverArt cover={cover} name={diary.title} width={boxWidth} height={boxHeight} shadow={shadow} />
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
  cell: { padding: 0, overflow: 'visible', justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'transparent', borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  page: { ...StyleSheet.absoluteFill, backgroundColor: C.white, justifyContent: 'flex-end' },
  pagePreview: { position: 'absolute', top: 0, left: 0, borderWidth: 0 },
  noCover: { alignSelf: 'flex-start', overflow: 'hidden', color: C.inkSoft, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: C.pale },
});
