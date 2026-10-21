import { memo } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';

function CreateDiaryCard({ layout = 'grid', compact = false, carouselActive = false, animatedStyle, onCreate }) {
  const carousel = layout === 'carousel';

  const card = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="새 다이어리 만들기"
      accessibilityState={carousel ? { selected: carouselActive } : undefined}
      onPress={onCreate}
      style={({ pressed }) => [
        s.createCard,
        carousel ? s.createCardCarousel : s.createCardGrid,
        compact && carousel && s.createCardCarouselCompact,
        compact && !carousel && s.createCardGridCompact,
        pressed && s.pressed,
      ]}
    >
      <View style={[s.createCardPanel, carousel && s.createCardPanelCarousel, compact && carousel && s.createCardPanelCarouselCompact, compact && !carousel && s.createCardPanelCompact]}>
        <View style={s.createCardPlus}>
          <AppIcon name="add" size={27} color="#536999" strokeWidth={1.7} />
        </View>
        <Text style={s.createCardTitle}>새 다이어리</Text>
        <Text style={s.createCardCopy}>새 기록을 시작해 보세요</Text>
      </View>
    </Pressable>
  );

  return carousel ? <Animated.View style={[animatedStyle, carouselActive && s.carouselCardTop]}>{card}</Animated.View> : card;
}

export default memo(CreateDiaryCard);
