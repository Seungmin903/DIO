import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import SharingEntry from '../../sharing/SharingEntry';
import { C, LIBRARY_SCOPES } from '../constants';
import { filterScope } from '../utils/libraryQuery';
import { styles as s } from '../styles';

const TABS = [
  ...LIBRARY_SCOPES.map(scope => ({ id: 'library', filter: scope.id, label: scope.tabLabel, icon: scope.icon })),
  { id: 'studio', label: '꾸미기 공방', icon: 'workshop' },
  { id: 'profile', label: '내 공간', icon: 'person' },
  { id: 'trash', label: '휴지통', icon: 'bin' },
];

// 폰 홈의 하단 탭. 태블릿 사이드 메뉴(SideRail)와 같은 navigate를 쓴다.
function BottomTabs({ page, filter, navigate, bottomInset = 0, onNotifications, invitationCount = 0, notificationLabel = '받은 초대', notificationCount, floating = false }) {
  return (
    <View style={[s.tabBarWrap, floating && s.tabBarWrapDesk, { paddingBottom: Math.max(bottomInset, 10) + 8 }]}>
      <View style={s.tabBar} accessibilityRole="tablist">
        {onNotifications && <SharingEntry notifications notificationCount={notificationCount} notificationLabel={notificationLabel} compact count={invitationCount} onPress={onNotifications}/>}
        {TABS.map((tab) => {
          const selected = page === tab.id && (!tab.filter || filterScope(filter) === tab.filter);
          return (
            <Pressable
              key={tab.label}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected }}
              onPress={() => navigate(tab.id, tab.filter)}
              style={({ pressed }) => [s.tabItem, pressed && s.pressed]}
            >
              <View style={[s.tabIconPill, selected && s.tabIconPillSelected]}>
                <AppIcon name={tab.icon} size={22} color={C.ink} fill="none" />
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
