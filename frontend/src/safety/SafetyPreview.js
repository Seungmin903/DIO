import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SafetyProvider, { useSafety } from './SafetyProvider';
import { SafetyButton } from './SafetyScreen';
import { createSafetyPreviewAdapter } from './safetyPreviewAdapter';
import { createUnavailableSafetyAdapter } from './safetyModel';
import { safetyStyles as s } from './styles';
import { createSharingPreview } from '../sharing/sharingPreview';
import { useNotifications } from '../notifications/useNotifications';
import SharingHub from '../sharing/SharingHub';
import ProfileScreen from '../diary/screens/ProfileScreen';
import { useFormFactor } from '../shared/useFormFactor';

const profile = { userId: 'self', nickname: '소연', mode: 'authenticated', provider: 'email' };
const profileService = { getProfile: async () => profile };
const sharingUser = { nickname: '소연' };
const samplePhoto = { uri: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="400"%3E%3Crect width="640" height="400" fill="%23DBDCF9"/%3E%3Ctext x="40" y="210" font-size="32"%3ESample evidence%3C/text%3E%3C/svg%3E', mimeType: 'image/png', size: 2048, fileName: 'sample.png' };
export default function SafetyPreview() {
  const [account, setAccount] = useState(0), [offline, setOffline] = useState(false);
  const adapter = useMemo(() => offline ? createUnavailableSafetyAdapter() : createSafetyPreviewAdapter({ accountId: String(account) }), [account, offline]);
  return <SafeAreaProvider>
    <SafetyProvider key={`${account}:${offline}`} user={{ ...profile, userId: account ? 'second-account' : 'self' }} adapter={adapter}
      evidencePicker={async () => [samplePhoto]}>
      <PreviewContent adapter={adapter} onSwitch={() => setAccount(value => value ? 0 : 1)} onOffline={() => setOffline(value => !value)} />
    </SafetyProvider>
  </SafeAreaProvider>;
}
function PreviewContent({ adapter, onSwitch, onOffline }) {
  const safety = useSafety(), { isPhone } = useFormFactor();
  const [runtime] = useState(() => createSharingPreview({ user: sharingUser }));
  const notifications = useNotifications(runtime.notificationApi, runtime.invitationGateway);
  const sharing = { runtime, notifications };
  useEffect(() => { runtime.activate(); return () => runtime.dispose(); }, [runtime]);
  const [diary, setDiary] = useState(null), [request, setRequest] = useState(null), [page, setPage] = useState('home'), [opened, setOpened] = useState(false);
  const [setupError, setSetupError] = useState('');
  useEffect(() => {
    let alive = true;
    const id = sharing.runtime.preview.receiveInvitation({ title: '우리의 계절', members: [
      { id: 'host', nickname: '하루', role: 'OWNER' }, { id: 'friend', nickname: '모아', role: 'EDITOR' },
    ] });
    sharing.runtime.accept(id, '소연').then(value => { if (alive) setDiary(value); })
      .catch(error => { if (alive) setSetupError(error.message); });
    return () => { alive = false; };
  }, [sharing.runtime]);
  const participants = (value, target) => {
    const previous = request; setRequest(null);
    safety.openParticipants(value, { target, onClosed: () => setRequest(previous) });
  };
  return <View style={{ flex: 1 }}>
    {page === 'profile' ? <><SafetyButton secondary onPress={() => setPage('home')}>미리보기 홈</SafetyButton><ProfileScreen onOpenBlockedUsers={safety.openBlocks} compact={isPhone} previewUser={profile} accountService={profileService} /></> :
      <ScrollView contentContainerStyle={[s.body, { maxWidth: 760, width: '100%', alignSelf: 'center' }]}>
        <Text style={s.title}>신고·차단 화면 미리보기</Text>
        <Text style={s.muted}>샘플 계정과 사진만 사용해요. 실제 신고·차단·초대나 다이어리 변경은 발생하지 않아요.</Text>
        {!!setupError && <Text style={s.error}>{setupError}</Text>}
        <View style={s.card}><Text style={s.heading}>우리의 계절</Text><Text style={s.muted}>현재 3명 · 이전 참여자 2명</Text>
          <SafetyButton disabled={!diary} onPress={() => setRequest({ diary })}>공유 화면 열기</SafetyButton>
          <SafetyButton secondary disabled={!diary} onPress={() => safety.openParticipants(diary)}>참여자 화면 열기</SafetyButton>
          <SafetyButton secondary disabled={!diary} onPress={async () => { setOpened(false); if (await safety.canOpenDiary(diary)) setOpened(true); }}>공유 다이어리 열기</SafetyButton>
          {opened && <Text accessibilityLiveRegion="polite" style={s.text}>다이어리가 열렸어요 · 참여·편집 권한 유지</Text>}
        </View>
        <SafetyButton secondary onPress={() => setPage('profile')}>마이페이지 열기</SafetyButton>
        <SafetyButton secondary onPress={safety.openBlocks}>차단 목록 열기</SafetyButton>
        {adapter.failNext && <SafetyButton secondary onPress={() => { adapter.failNext('report'); }}>다음 신고 실패 재현</SafetyButton>}
        <SafetyButton secondary onPress={onSwitch}>샘플 계정 전환</SafetyButton>
        <SafetyButton secondary onPress={onOffline}>서버 미연결 전환</SafetyButton>
      </ScrollView>}
    <SharingHub request={request} runtime={sharing.runtime} model={sharing.notifications} onClose={() => setRequest(null)}
      onOpenParticipants={participants} onOpenDiary={() => setRequest(null)} onOpenCopy={() => setRequest(null)} />
  </View>;
}
