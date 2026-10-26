import { memo } from 'react';
import { Text, View } from 'react-native';
import { styles as s } from '../styles';
import CoverPattern from './CoverPattern';
import { DIARY_DEFAULTS } from '../constants';

function Cover({ thumbnailWidth, diary, small = false, preview = false, carousel = false, grid = false, compact = false }) {
  // 고정 폭은 이미 결정된 카드 props로 계산한다. 반응형 격자는 비율 배치로 처리해
  // 표지마다 크기를 측정하고 두 번 그리거나, 첫 프레임에 글자가 튀지 않게 한다.
  const width = thumbnailWidth ?? (preview ? s.bookPreview.width : small ? s.coverSmall.width
    : carousel ? (compact ? s.cardCarouselCompact.width : s.cardCarousel.width) : s.bookPreview.width);
  const sx = width / s.bookPreview.width;
  const titleSize = thumbnailWidth ? 15 * sx : Math.max(12, 15 * sx);
  const metaSize = thumbnailWidth ? 8.5 * sx : Math.max(10, 8.5 * sx);
  return (
    <View
      style={[s.cover, small && s.coverSmall, carousel && s.coverCarousel, compact && carousel && s.coverCarouselCompact, grid && s.coverGrid, compact && grid && s.coverGridCompact, preview && s.bookPreview,
        { backgroundColor: diary.color, padding: 0, borderTopLeftRadius: 6 * sx, borderBottomLeftRadius: 6 * sx, borderTopRightRadius: 14 * sx, borderBottomRightRadius: 14 * sx }, thumbnailWidth && {width, height: width * 246 / 185, minHeight: 0}]}>
      <CoverPattern pattern={diary.pattern} />
      <View style={[s.bookSpine, { width: '4.864865%' }]} />
      <View style={[s.bookBand, { right: '16.216216%', width: '3.783784%' }]} />
      <View style={[s.bookLabel, { top: '20.325203%', left: '13.513514%', right: '14.054054%', paddingHorizontal: 12 * sx, paddingVertical: 10 * sx, borderRadius: 3 * sx }]}>
        <Text numberOfLines={1} style={[s.bookLabelTitle, { fontSize: titleSize }]}>{diary.title?.trim() || DIARY_DEFAULTS.title}</Text>
        {/* 좁은 표지에서는 줄바꿈을 허용해 날짜·만년형 표시를 축소하거나 잘라내지 않는다. */}
        <Text style={[s.bookLabelMeta, { fontSize: metaSize, letterSpacing: compact || small ? 0.6 : 1.4 * sx, marginTop: 6 * sx }]}>DIARY · {diary.templateConfig?.dateMode === 'undated' ? '만년형' : '2026'}</Text>
      </View>
    </View>
  );
}

export default memo(Cover);
