import { Children, cloneElement, isValidElement } from 'react';
import { Text, View } from 'react-native';
import { styles as s } from '../styles';

// 선택 모드 도구줄(보관함 · 휴지통 공용): 왼쪽에 개수, 오른쪽에 동작 버튼(SelectionButton). 순서는 전체 선택 · 주 동작 · 완료로, 선택 모드를 끝내는 `완료`는 늘 맨 오른쪽이다. 좁은 폰에서는 버튼이 다음 줄 오른쪽으로 내려간다.
// style: 놓이는 자리에 맞춘 바깥 모양(예: 패널 바닥에서는 상자 대신 위 구분선)
// compact(폰): 둥근 상자 대신 본문 좌우 끝까지 꽉 찬 옅은 띠(코덱스 2026-11-03 시안 B).
// 띠는 두 줄: 위 `N개 선택됨` · 오른쪽 끝 `완료`(done), 아래 동작 버튼들이 폭을 똑같이 나눠 채운다(코덱스 C안, 버튼 수가 달라도 같은 구조).
// done: 폰 띠에서 첫 줄 오른쪽에 두는 완료 버튼. 폰이 아니면 동작 버튼 뒤(맨 오른쪽)에 이어 붙는다
export default function SelectionBar({ count, style, compact = false, done = null, children }) {
  if (compact) {
    return (
      <View style={[s.selectBar, s.selectBarBand, style]} accessibilityRole="toolbar">
        <View style={s.selectBandHead}>
          <Text accessibilityLiveRegion="polite" style={[s.selectCount, s.selectCountBand]}>{`${count}개 선택됨`}</Text>
          {done}
        </View>
        <View style={s.selectBandActions}>
          {Children.map(children, (child) => (isValidElement(child) ? cloneElement(child, { fill: true }) : child))}
        </View>
      </View>
    );
  }
  return (
    <View style={[s.selectBar, style]} accessibilityRole="toolbar">
      <Text accessibilityLiveRegion="polite" style={s.selectCount}>{`${count}개 선택됨`}</Text>
      <View style={s.selectActions}>{children}{done}</View>
    </View>
  );
}
