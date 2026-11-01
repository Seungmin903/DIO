import { View } from 'react-native';
import { C } from '../constants';
import { styles as s } from '../styles';
import AppIcon from '../../shared/AppIcon';

// 선택 모드에서 표지 오른쪽 위에 얹는 체크 원(보관함 · 휴지통 카드 공용). 고르면 primaryStrong 으로 차고 흰 체크가 든다. 표지 윤곽은 두르지 않는다(사용자 결정).
export default function SelectionMark({ selected }) {
  return (
    <View pointerEvents="none" style={[s.cardCheck, selected && s.cardCheckOn]}>
      {selected && <AppIcon name="check" size={18} color={C.white} strokeWidth={2.6} />}
    </View>
  );
}
