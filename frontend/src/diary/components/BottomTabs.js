import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { C } from '../constants';
import { styles as s } from '../styles';
import { BOTTOM_TABS, isBottomTabSelected, navigateBottomTab } from './bottomTabModel';

// 폰에서는 화면 전환을 담당하는 하단 네비게이션 바를 쓴다. 알림은 상단 아이콘으로 분리한다.
function BottomTabs({ page, filter, navigate, bottomInset = 0 }) {
  return (
    <View style={[s.tabBarWrap, { paddingBottom: bottomInset }]}>
      <View style={s.tabBar} accessibilityRole="tablist">
        {BOTTOM_TABS.map(tab => {
          const selected = isBottomTabSelected(page, filter, tab);
          return (
            <Pressable
              key={tab.label}
              accessibilityRole="tab"
              accessibilityLabel={tab.accessibilityLabel}
              accessibilityState={{ selected }}
              onPress={() => navigateBottomTab(navigate, tab)}
              style={({ pressed }) => [s.tabItem, pressed && s.pressed]}
            >
              <View collapsable={false} style={[s.tabIconPill, selected && s.tabIconPillSelected]}>
                <AppIcon name={tab.icon} size={20} color={C.ink} fill="none" />{/* 태블릿 좌측 바 메뉴 아이콘과 같은 20 (2026-11-08 사용자 결정) */}
              </View>
              <Text numberOfLines={1} style={[s.tabLabel, selected && s.tabLabelSelected]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default memo(BottomTabs);
