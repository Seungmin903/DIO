import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import SharingEntry from '../../sharing/SharingEntry';
import { C } from '../constants';
import { styles as s } from '../styles';

const TABS = [
  { id: 'library', filter: 'personal', label: '다이어리', icon: 'book' },
  { id: 'library', filter: 'favorite', label: '즐겨찾기', icon: 'star' },
  { id: 'profile', label: '내 공간', icon: 'person' },
  { id: 'trash', label: '휴지통', icon: 'trash' },
];

// 폰 홈의 하단 탭. 태블릿 사이드 메뉴(SideRail)와 같은 navigate를 쓴다.
function BottomTabs({ page, filter, navigate, bottomInset = 0, onNotifications, invitationCount = 0, notificationLabel = '받은 초대', notificationCount }) {
  return (
    <View style={[s.tabBarWrap, { paddingBottom: Math.max(bottomInset, 10) + 8 }]}>
      <View style={s.tabBar} accessibilityRole="tablist">
        {onNotifications && <SharingEntry notifications notificationCount={notificationCount} notificationLabel={notificationLabel} compact count={invitationCount} onPress={onNotifications}/>}
        {TABS.map((tab) => {
          const selected = page === tab.id && (!tab.filter || filter === tab.filter);
          return (
            <Pressable
              key={tab.label}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected }}
              onPress={() => navigate(tab.id, tab.filter)}
              style={({ pressed }) => [s.tabItem, selected && s.tabItemSelected, pressed && s.pressed]}
            >
              <AppIcon name={tab.icon} size={21} color={selected ? C.ink : C.muted} fill={selected && tab.icon === 'star' ? C.ink : 'none'} />
              <Text numberOfLines={1} style={[s.tabLabel, selected && s.tabLabelSelected]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default memo(BottomTabs);
