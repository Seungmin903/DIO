import { Text, View } from 'react-native';
import { styles as s } from '../styles';

// 선택 모드 도구줄(보관함 · 휴지통 공용): 왼쪽에 개수, 오른쪽에 동작 버튼(SelectionButton). 순서는 전체 선택 · 주 동작 · 완료로, 선택 모드를 끝내는 `완료`는 늘 맨 오른쪽이다. 좁은 폰에서는 버튼이 다음 줄 오른쪽으로 내려간다.
// style: 놓이는 자리에 맞춘 바깥 모양(예: 패널 바닥에서는 상자 대신 위 구분선)
export default function SelectionBar({ count, style, children }) {
  return (
    <View style={[s.selectBar, style]} accessibilityRole="toolbar">
      <Text accessibilityLiveRegion="polite" style={s.selectCount}>{`${count}개 선택됨`}</Text>
      <View style={s.selectActions}>{children}</View>
    </View>
  );
}
