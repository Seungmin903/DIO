import { Image, Pressable, Text, View } from 'react-native';
import { C } from '../constants';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';

// 빈 화면의 캐릭터(최종 시안 그림). 캐릭터는 버터 노랑 + 라벤더라 색 규칙에 그대로 맞는다. 선 · 상자 없이 캐릭터와 제목만 둔다.
const ART = {
  dio: { source: require('../../../assets/characters/dio.png'), width: 112, compactWidth: 96, ratio: 410 / 360 }, // 디오: 보관함이 비었을 때
  duri: { source: require('../../../assets/characters/duri.png'), width: 112, compactWidth: 96, ratio: 393 / 360 }, // 두리: 휴지통이 비었을 때(조용한 화면)
};

export default function EmptyState({ title, onCreate, search = false, compact = false, art = 'dio', raised = false }) {
  const picture = search ? null : ART[art] || ART.dio;
  const width = picture ? (compact ? picture.compactWidth : picture.width) : 0;
  return (
    <View style={[s.empty, compact && s.emptyCompact, raised && (compact ? s.emptyRaisedCompact : art === 'duri' ? s.emptyRaisedTrash : s.emptyRaised)]}>
      {picture ? (
        // 그림은 꾸밈이라 화면 읽기 프로그램에서는 건너뛰고 제목만 읽힌다
        <Image source={picture.source} accessible={false} accessibilityIgnoresInvertColors style={{ width, height: width * picture.ratio, marginBottom: 14 }} resizeMode="contain" />
      ) : (
        <View style={s.emptyIcon}>
          <AppIcon name="search" size={30} color={C.blue} strokeWidth={1.7} />
        </View>
      )}
      <Text accessibilityRole="header" style={s.emptyTitle}>{title}</Text>
      {onCreate && (
        <Pressable accessibilityRole="button" onPress={onCreate} style={({ pressed }) => [s.secondary, pressed && s.pressed]}>
          <Text style={s.secondaryText}>새 다이어리 만들기</Text>
          <Text style={s.secondaryArrow}>→</Text>
        </Pressable>
      )}
    </View>
  );
}
