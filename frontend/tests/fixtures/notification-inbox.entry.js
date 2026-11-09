import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import HomeNotificationFlow from '../../src/notifications/HomeNotificationFlow';
import AuthenticatedNotificationDialog from '../../src/notifications/AuthenticatedNotificationDialog';
import { useNotifications } from '../../src/notifications/useNotifications';
import { createNotificationApi, createInvitationGateway } from '../../src/notifications/notificationApi';
import { createMockNotificationTransport } from '../../src/notifications/mockNotificationTransport';

const params = new URLSearchParams(location.search);
const mock = createMockNotificationTransport({ delay: params.has('loading') ? 60000 : 20, pageSize: 3, seed: !params.has('empty') });
globalThis.__notificationInboxQa = { setInvitationStatus: mock.setInvitationStatus };
if (params.has('error')) mock.setScenario('list', 'error');
const api = createNotificationApi(mock.transport), invitations = createInvitationGateway(mock.getInvitation);
const flowRuntime = { self: { id: 'self', nickname: '테스트 계정' }, supportsReadState: true, getSnapshot: () => ({ joined: [] }), hasMembership: () => false, invitationGateway: invitations };
function App() {
  const model = useNotifications(api, invitations);
  const [request, setRequest] = useState({ mode: 'notifications' });
  const [open, setOpen] = useState(true), [result, setResult] = useState('');
  return <View style={{ flex: 1, backgroundColor: '#F7F8FD', padding: 24 }}>
    <Text>내 다이어리</Text><Text>{result}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="알림 열기" onPress={() => setOpen(true)}><Text>알림 열기</Text></Pressable>
    {params.has('flow') && open ? <HomeNotificationFlow request={request} model={model} sharing={{ notifications: model, runtime: flowRuntime }} onRequest={setRequest} onClose={() => setOpen(false)} /> : open && <AuthenticatedNotificationDialog model={model} onClose={() => setOpen(false)} onInvitationReady={value => { if (params.has('navigation-error')) return Promise.reject(new Error('fixture navigation failure')); setResult(`초대 이동: ${value.inviteId}`); setOpen(false); }} />}
  </View>;
}
registerRootComponent(() => <SafeAreaProvider><App /></SafeAreaProvider>);
