import { useEffect, useState } from 'react';
import { registerRootComponent } from 'expo';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SharingEntry from '../../src/sharing/SharingEntry';
import SharingHub from '../../src/sharing/SharingHub';
import { useSharing } from '../../src/sharing/useSharing';
const user = { nickname: '소연' };
function Fixture() {
  const sharing = useSharing(user);
  const [request, setRequest] = useState(null);
  const [opened, setOpened] = useState('');
  useEffect(() => {
    sharing.runtime.registerDiary({ id: 'local', title: '나의 다이어리' });
  }, [sharing.runtime]);
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: '#CED9EE', padding: 24 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="소유자 공유 열기"
          onPress={() => setRequest({ diary: { id: 'local', title: '나의 다이어리' } })}
        >
          <Text>공유</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="초대 목록 열기"
          onPress={() => setRequest({ mode: 'invitations' })}
        >
          <Text>받은 초대</Text>
        </Pressable>
        <SharingEntry
          count={sharing.notifications.count.data?.actionableUnreadCount || 0}
          members={sharing.diaries.find((diary) => diary.id === 'local')?.members || []}
          onPress={() => setRequest({ diary: { id: 'local', title: '나의 다이어리' } })}
        />
        <Text testID="joined">{sharing.joined.length}</Text>
        <Text testID="opened">{opened}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="새 초대 도착 재현"
          onPress={() => { sharing.runtime.preview.receiveInvitation({ title: '새로 도착한 기록' }); sharing.notifications.store.refresh(); }}>
          <Text>새 초대 도착 재현</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="정원 초과 초대 재현"
          onPress={() => { sharing.runtime.preview.receiveInvitation({ title: '가득 찬 기록',
            members: Array.from({ length: 4 }, (_, i) => ({ id: `m-${i}`, nickname: `멤버${i}`, role: i ? 'EDITOR' : 'OWNER' })),
          }); sharing.notifications.store.refresh(); setRequest({ mode: 'invitations' }); }}>
          <Text>정원 초과 초대 재현</Text>
        </Pressable>
        <SharingHub
          request={request}
          runtime={sharing.runtime}
          model={sharing.notifications}
          onClose={() => setRequest(null)}
          onOpenDiary={id => { setOpened(id); setRequest(null); }}
        />
      </View>
    </SafeAreaProvider>
  );
}
registerRootComponent(Fixture);
