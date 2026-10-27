import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors as C } from '../shared/theme';
import { createNotificationApi, createInvitationGateway } from './notificationApi';
import { createMockNotificationTransport } from './mockNotificationTransport';
import { NotificationProvider, useSharedNotifications } from './NotificationProvider';
import NotificationPanel, { NotificationButton as Button, NotificationEntry } from './NotificationPanel';

export default function MockNotifications({ onClose }) {
  const [account, setAccount] = useState('A');
  return <Session key={account} account={account} onClose={onClose} onSwitch={() => setAccount(value => value === 'A' ? 'B' : 'A')} />;
}
function Session({ account, onClose, onSwitch }) {
  const mock = useMemo(() => createMockNotificationTransport({ account }), [account]);
  const api = useMemo(() => createNotificationApi(mock.transport), [mock]);
  const invitations = useMemo(() => createInvitationGateway(mock.transport), [mock]);
  return <NotificationProvider api={api} invitations={invitations}><SessionContent account={account} onClose={onClose} onSwitch={onSwitch} mock={mock} /></NotificationProvider>;
}
function SessionContent({ account, onClose, onSwitch, mock }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const model = useSharedNotifications();
  const [open, setOpen] = useState(true), [controls, setControls] = useState(false), [modes, setModes] = useState({});
  const [destination, setDestination] = useState(null);
  const choose = (channel, mode) => { mock.setScenario(channel, mode); setModes(current => ({ ...current, [channel]: mode })); };
  return <View style={[s.safe, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
    <ScrollView style={{ maxHeight: height * 0.35, flexGrow: 0, flexShrink: 0 }} contentContainerStyle={s.header}>
      <Text style={s.title}>{`목 알림 · 샘플 계정 ${account}`}</Text>
      <Button label="목 보관함으로 돌아가기" onPress={onClose} />
      <Button label="알림 샘플 계정 변경" onPress={onSwitch} />
      <Button label="알림 목 응답 설정" onPress={() => setControls(value => !value)} />
      <NotificationEntry count={model.count} onPress={() => { setOpen(true); model.store.refresh(); }} />
      <NotificationEntry label="공유 버튼 연결 검증" count={model.count} onPress={() => { setOpen(true); model.store.refresh(); }} />
      <Button label={open ? '알림 목록 닫기' : '알림 목록 열기'} onPress={() => { setOpen(value => !value); if (!open) model.store.refresh(); }} />
    </ScrollView>
    {controls && <ScrollView testID="notification-mock-controls" style={[s.controls, { maxHeight: Math.min(240, height * 0.28) }]} contentContainerStyle={s.controlsContent}>
      <Text style={s.text}>메모리 목 API예요. 실제 알림·초대 전송이나 로컬 데이터 변경은 하지 않아요. 선택 후 조회 버튼/알림 동작을 눌러 주세요.</Text>
      {[
        ['list', '목록', [['success', '정상'], ['fail-once', '한 번 실패'], ['error', '계속 실패'], ['empty', '빈 목록']]],
        ['count', '알림 수', [['success', '정상'], ['fail-once', '한 번 실패']]],
        ['write', '읽음·삭제', [['success', '정상'], ['fail-once', '한 번 실패'], ['response-lost', '응답 유실'], ['forbidden', '권한 없음']]],
        ['invitation', '초대', [['success', '정상'], ['fail-once', '한 번 실패'], ['expired', '만료'], ['revoked', '취소'], ['forbidden', '권한 없음'], ['cannot-open', '이동 불가']]],
      ].map(([channel, label, options]) => <View key={channel} style={s.header}>{options.concat([
        ['unauthorized', '로그인 필요'], ['forbidden', '권한 없음'], ['not-found', '없음'], ['network-error', '네트워크 오류'],
      ].filter(([value]) => !options.some(([existing]) => existing === value))).map(([value, text]) =>
        <Button key={value} label={`${label} ${text}`} selected={(modes[channel] || 'success') === value} onPress={() => choose(channel, value)} />)}</View>)}
      <Button label="새 초대 도착" onPress={() => { mock.add(); }} />
      <Button label="일반 알림 도착" onPress={() => mock.addGeneral()} />
      <Button label="알 수 없는 종류 도착" onPress={() => mock.addGeneral('FUTURE_TYPE')} />
      <Button label="포그라운드 복귀 재조회" onPress={model.store.refresh} />
      <Text style={s.text}>새 초대는 자동 30초 카운트 조회 또는 재조회 후 표시돼요. 전체 읽음 재시도 중 새로 온 초대는 안 읽음으로 남아요.</Text>
    </ScrollView>}
    {destination ? <View style={s.header}><Text style={s.text}>{`공유 화면 전달 확인: ${destination.inviteId} · ${destination.diary?.title}`}</Text><Text style={s.text}>초대를 수락하지 않았어요. 224 화면은 팀원 구현 후 연결해요.</Text><Button label="알림으로 돌아가기" onPress={() => { setDestination(null); model.store.refresh(); }} /></View>
      : open ? <NotificationPanel model={model} onInvitationReady={setDestination} /> : <Text style={s.text}>목록을 닫아도 알림 수는 앱 활성 중 갱신돼요.</Text>}
  </View>;
}
const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: C.surfaceSoft }, header: { padding: 12, gap: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', maxWidth: '100%', backgroundColor: C.surface }, controls: { flexGrow: 0, flexShrink: 0 }, controlsContent: { padding: 12, gap: 8 }, text: { color: C.text, fontSize: 14 }, title: { color: C.text, fontSize: 18, fontWeight: '700' } });
