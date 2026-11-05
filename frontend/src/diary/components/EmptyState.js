import { Image, Pressable, Text, View } from 'react-native';
import { C } from '../constants';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';
import { CHARACTER_SCALE } from '../../shared/characterScale';

// 빈 화면의 캐릭터(최종 시안 그림). 캐릭터는 버터 노랑 + 라벤더라 색 규칙에 그대로 맞는다. 선 · 상자 없이 캐릭터와 제목만 둔다.
// 폭은 모아 기준이고, 디오는 모아 : 디오 키 비율에 맞게 scale 만큼 키운다(shared/characterScale).
const ART = {
  moa: { source: require('../../../assets/characters/moa.png'), width: 100, compactWidth: 86, ratio: 410 / 360, scale: CHARACTER_SCALE.moa }, // 모아: 보관함이 비었을 때
  dio: { source: require('../../../assets/characters/dio.png'), width: 100, compactWidth: 86, ratio: 393 / 360, scale: CHARACTER_SCALE.dio }, // 디오: 휴지통이 비었을 때(조용한 화면)
};

export default function EmptyState({ title, onCreate, action = null, search = false, compact = false, art = 'moa', raised = false }) {
  const picture = search ? null : ART[art] || ART.moa;
  const width = picture ? Math.round((compact ? picture.compactWidth : picture.width) * picture.scale) : 0;
  return (
    <View style={[s.empty, compact && s.emptyCompact, raised && (compact ? s.emptyRaisedCompact : art === 'dio' ? s.emptyRaisedTrash : s.emptyRaised)]}>
      {picture ? (
        // 그림은 꾸밈이라 화면 읽기 프로그램에서는 건너뛰고 제목만 읽힌다
        <Image source={picture.source} accessible={false} accessibilityIgnoresInvertColors style={{ width, height: width * picture.ratio, marginBottom: 14 }} resizeMode="contain" />
      ) : (
        <View style={s.emptyIcon}>
          <AppIcon name="search" size={30} color={C.blue} strokeWidth={1.7} />
        </View>
      )}
      <Text accessibilityRole="header" style={s.emptyTitle}>{title}</Text>
      {action && (
        <Pressable accessibilityRole="button" onPress={action.onPress} style={({ pressed }) => [s.secondary, pressed && s.pressed]}>
          <Text style={s.secondaryText}>{action.label}</Text>
          <AppIcon name="chevron-right" size={20} forText={13} color={C.ink} />
        </Pressable>
      )}
      {onCreate && (
        <Pressable accessibilityRole="button" onPress={onCreate} style={({ pressed }) => [s.secondary, pressed && s.pressed]}>
          <Text style={s.secondaryText}>새 다이어리 만들기</Text>
          <AppIcon name="chevron-right" size={20} forText={13} color={C.ink} />
        </Pressable>
      )}
    </View>
  );
}
