import { Image, Pressable, Text, View } from 'react-native';
import { C } from '../constants';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';
import { DIO_KEY, MOA_KEY } from '../../shared/characterScale';

// 빈 화면의 캐릭터(최종 시안 그림). 캐릭터는 버터 노랑 + 라벤더라 색 규칙에 그대로 맞는다. 선 · 상자 없이 캐릭터와 제목만 둔다.
// 원본의 투명 여백을 제외한 경계로 배치한다.
const MASCOT_HEIGHT = 112;
const COMPACT_MASCOT_HEIGHT = 96;
const ART = {
  moa: { source: require('../../../assets/characters/new_moa.png'), sourceWidth: 1254, sourceHeight: 975, left: 319, top: 183, width: 630, height: 760, heightScale: 1 },
  dio: { source: require('../../../assets/characters/new_dio.png'), sourceWidth: 1254, sourceHeight: 975, left: 313, top: 175, width: 824, height: 797, heightScale: DIO_KEY / MOA_KEY },
};

export default function EmptyState({ title, onCreate, action = null, search = false, compact = false, art = 'moa', raised = false }) {
  const picture = search ? null : ART[art] || ART.moa;
  const scale = picture ? (compact ? COMPACT_MASCOT_HEIGHT : MASCOT_HEIGHT) * picture.heightScale / picture.height : 0;
  return (
    <View style={[s.empty, compact && s.emptyCompact, raised && (compact ? s.emptyRaisedCompact : art === 'dio' ? s.emptyRaisedTrash : s.emptyRaised)]}>
      {picture ? (
        // 그림은 꾸밈이라 화면 읽기 프로그램에서는 건너뛰고 제목만 읽힌다
        <View style={{ width: picture.width * scale, height: picture.height * scale, marginBottom: 14, overflow: 'hidden' }}>
          <Image source={picture.source} accessible={false} accessibilityIgnoresInvertColors resizeMode="contain" style={{
            position: 'absolute', left: -picture.left * scale, top: -picture.top * scale,
            width: picture.sourceWidth * scale, height: picture.sourceHeight * scale,
          }} />
        </View>
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
