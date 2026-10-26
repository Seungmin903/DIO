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
          members={sharing.diaries.find((diary) => diary.id === 'local')?.members || []}
          onPress={() => setRequest({ diary: { id: 'local', title: '나의 다이어리' } })}
        />
        <Text testID="joined">{sharing.joined.length}</Text>
        <SharingHub
          request={request}
          runtime={sharing.runtime}
          model={sharing.notifications}
          onClose={() => setRequest(null)}
        />
      </View>
    </SafeAreaProvider>
  );
}
registerRootComponent(Fixture);
