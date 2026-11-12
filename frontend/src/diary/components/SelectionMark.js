import { View } from 'react-native';
import { C } from '../constants';
import { styles as s } from '../styles';
import AppIcon from '../../shared/AppIcon';

// 선택 모드에서 표지 오른쪽 위에 얹는 체크 원(보관함 · 휴지통 카드 공용). 고르면 primaryStrong 으로 차고 흰 체크가 든다. 표지 윤곽은 두르지 않는다(사용자 결정).
// compact(폰): 즐겨찾기 별만큼 작게
export default function SelectionMark({ selected, compact = false }) {
  return (
    <View pointerEvents="none" style={[s.cardCheck, compact && s.cardCheckCompact, selected && s.cardCheckOn]}>
      {selected && <AppIcon name="check" size={compact ? 14 : 18} color={C.white} strokeWidth={compact ? 2.8 : 2.6} />}
    </View>
  );
}
