import TrashScreen from './TrashScreen';
import {createAccountDiaryLifecycle} from '../services/accountDiaryLifecycle.js';
import { useDiaryEditor } from '../hooks/useDiaryEditor';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Modal from '../../editor/components/controls/EditorModal';
import { C } from '../constants';
import LibraryScreen from './LibraryScreen';
import { useLibraryReader } from '../hooks/useLibraryReader';
import { createAuthenticatedDiaryApi, diaryReadRequest, accountDiaryUpdateInput } from '../services/authenticatedDiaryApi.js';
import AuthenticatedNotificationDialog from '../../notifications/AuthenticatedNotificationDialog';
import { useOptionalSharedNotifications } from '../../notifications/NotificationProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DiaryCreateModal from '../components/DiaryCreateModal';
import ConfirmDialog from '../../editor/components/controls/ConfirmDialog';
import { createId } from '../../editor/utils/common';
import { createAccountDiaryCreation } from '../services/accountDiaryCreation.js';

function Button({ label, onPress, disabled = false }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [s.button, (pressed || disabled) && { opacity: 0.5 }]}><Text style={s.text}>{label}</Text></Pressable>;
}
function RequestNotice({ request, retry }) {
  if (request.status === 'loading') return <View accessibilityLiveRegion="polite" style={s.row}><ActivityIndicator color={C.blue} /><Text style={s.text}>불러오는 중이에요.</Text></View>;
  if (request.status !== 'error') return null;
  return <View accessibilityLiveRegion="polite" style={s.notice}><Text style={s.text}>{request.error.message}</Text>
    {![401, 403, 404].includes(request.error.status) && <Button label="다시 불러오기" onPress={retry} />}</View>;
}

export default function AuthenticatedDiaryLibrary({ auth, userId, onOpenLocal, onLogout }) {
  const insets = useSafeAreaInsets(), { width } = useWindowDimensions();
  const sessionKey = auth.getSessionKey();
  const api = useMemo(() => createAuthenticatedDiaryApi({ auth, userId }), [auth, userId, sessionKey]);
  const state = useLibraryReader(api, sessionKey, diaryReadRequest), { reader } = state;
  const trashState=useLibraryReader(api,sessionKey,diaryReadRequest),trashReader=trashState.reader;
  const [trashOpen,setTrashOpen]=useState(false),[trashConfirm,setTrashConfirm]=useState(null),[purgeConfirm,setPurgeConfirm]=useState(null);
  const lifecycle=useMemo(()=>createAccountDiaryLifecycle(api),[api]);
  const action=useSyncExternalStore(lifecycle.subscribe,lifecycle.getSnapshot,lifecycle.getSnapshot);
  const actionBusy=action.status==='saving'||action.canRetry;
  useEffect(()=>()=>lifecycle.reset(),[lifecycle]);
  useEffect(()=>{trashReader.load({status:'trashed'});},[trashReader]);
  useEffect(()=>{
    if(action.status==='saving')setCreatedMessage('');
    else if(action.status==='success') {
      setCreatedMessage(action.result.kind==='trash'?'휴지통으로 이동했어요.':action.result.kind==='permanentlyDelete'?'다이어리를 영구 삭제했어요.':'다이어리를 복원했어요.');
      reader.close();reader.refresh();trashReader.refresh();lifecycle.reset();
    } else if(action.status==='error' && !action.canRetry) {reader.refresh();trashReader.refresh();}
  },[action.status,action.result,action.canRetry,lifecycle,reader,trashReader]);
  const editing=useDiaryEditor(api,accountDiaryUpdateInput);
  useEffect(()=>{
    if(editing.mutation.status!=='success')return;
    setCreatedMessage(`${editing.mutation.result.title}을 수정했어요.`);
    editing.editor.close(); reader.close(); reader.refresh();
  },[editing.mutation.status,editing.mutation.result,editing.editor,reader]);
  const [filter, setFilter] = useState('personal'), [sort, setSort] = useState('updated');
  const [query, setQuery] = useState(''), [searchOpen, setSearchOpen] = useState(false);
  const [view, setView] = useState('grid'), [carousel, setCarousel] = useState(0);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const notifications = useOptionalSharedNotifications();
  const creator=useMemo(()=>createAccountDiaryCreation(api,{storage:AsyncStorage,userId,makeKey:createId}),[api,userId]);
  const creation=useSyncExternalStore(creator.subscribe,creator.getSnapshot,creator.getSnapshot);
  const [createOpen,setCreateOpen]=useState(false),[formKey,setFormKey]=useState(0),[discardOpen,setDiscardOpen]=useState(false);
  const [createdMessage,setCreatedMessage]=useState('');
  useEffect(()=>{creator.load();return()=>creator.dispose();},[creator]);
  useEffect(()=>{
    if(creation.status!=='success')return;
    setCreateOpen(false);setCreatedMessage(`${creation.result.title}을 만들었어요.`);
    setFilter('personal');setSearchOpen(false);setQuery('');
    reader.load({filter:'personal',sort:'updated',query:''});setSort('updated');
  },[creation.status,creation.result,reader]);
  const openCreate=()=>{setFormKey(value=>value+1);setCreateOpen(true);};
  useEffect(() => { reader.load({ filter, sort, query: searchOpen ? query : '' }); }, [reader, filter, sort, query, searchOpen]);
  useEffect(() => {
    const refresh = () => { reader.close(); reader.refresh(); trashReader.refresh(); };
    const sub = AppState.addEventListener('change', value => { if (value === 'active') refresh(); });
    const visible = () => { if (globalThis.document?.visibilityState === 'visible') refresh(); };
    globalThis.document?.addEventListener('visibilitychange', visible);
    return () => { sub.remove(); globalThis.document?.removeEventListener('visibilitychange', visible); };
  }, [reader,trashReader]);
  const rows = state.list.data?.items || [];
  const metadata = useMemo(() => Object.fromEntries(rows.map(row => [row.id, { pageCount: row.pageCount }])), [rows]);
  const count = notifications?.count.data?.unreadCount;
  const detail = state.detail.data;
  return <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <View style={s.toolbar}><Text accessibilityRole="header" style={s.title}>내 계정 보관함</Text>
      <View style={s.row}><Button label="이 기기 보관함" onPress={onOpenLocal} />
        <Button label={trashOpen?'보관함 보기':'휴지통 보기'} onPress={()=>{reader.close();setTrashOpen(!trashOpen);if(!trashOpen)trashReader.refresh();}} />
        <Button label={count == null ? '알림' : `알림 ${count}개`} onPress={() => setNotificationOpen(true)} />
        <Button label="로그아웃" onPress={onLogout} /></View></View>
    {(action.status==='saving'||action.error) && <View style={s.notice}>
      {action.status==='saving' && <Text accessibilityLiveRegion="polite" style={s.text}>처리 중이에요.</Text>}
      {action.error && <Text accessibilityRole="alert" style={s.text}>{action.error.message}</Text>}
      {action.canRetry && <Button label="같은 요청 다시 확인" onPress={lifecycle.retry} />}
    </View>}
    {trashOpen ? <TrashScreen compact={width<700} serverMode diaries={trashState.list.data?.items||[]}
      busy={actionBusy || trashState.list.status!=='success'} onRestore={id=>lifecycle.run({kind:'restore',id})} onDeletePermanently={setPurgeConfirm}
      suppressEmpty={trashState.list.status!=='success'} requestNotice={<View style={s.notice}>
        {!!createdMessage && <Text accessibilityLiveRegion="polite" style={s.text}>{createdMessage}</Text>}
        <RequestNotice request={trashState.list} retry={trashReader.refresh} />
        <Button label="휴지통 새로고침" onPress={trashReader.refresh} disabled={trashState.list.status==='loading'} />
        <RequestNotice request={trashState.more} retry={trashReader.retryMore} />
        {trashState.list.data?.hasNext && <Button label="휴지통 더 보기" onPress={()=>trashReader.loadMore()} disabled={trashState.more.status==='loading'} />}
      </View>} /> : <LibraryScreen compact={width < 700} diaries={rows} metadata={metadata} filter={filter} onFilterChange={setFilter}
      sort={sort} onSortChange={setSort} view={view} onViewChange={setView} carousel={carousel} onCarouselChange={setCarousel}
      onOpen={row => reader.open(row.id)} historyKey={`dio:account-search:${userId}`}
      onEdit={row=>editing.editor.open(row.id)}
      onDelete={actionBusy||state.list.status!=='success'?undefined:setTrashConfirm}
      onCreate={creation.status==='loading'?undefined:openCreate}
      remoteQuery={{ query, onQueryChange: setQuery, searchOpen, onSearchOpenChange: setSearchOpen, supportsShared: true }}
      suppressEmpty={state.list.status !== 'success'} hasMore={state.list.data?.hasNext === true}
      requestNotice={<View style={s.notice}><RequestNotice request={state.list} retry={reader.refresh} />
        {!!createdMessage && <Text accessibilityLiveRegion="polite" style={s.text}>{createdMessage}</Text>}
        {creation.status==='error' && <Button label="이전 생성 요청 확인" onPress={openCreate} />}
        <Button label="목록 새로고침" onPress={reader.refresh} disabled={state.list.status === 'loading'} />
        <RequestNotice request={state.more} retry={reader.retryMore} />
        {state.list.data?.hasNext && <Button label="더 보기" onPress={() => reader.loadMore()} disabled={state.more.status === 'loading'} />}
      </View>} />}
    <Modal visible={state.selectedId !== null} onRequestClose={reader.close} animationType="fade">
      <ScrollView contentContainerStyle={[s.detail, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <Button label="상세 닫기" onPress={reader.close} /><Text accessibilityRole="header" style={s.title}>다이어리 상세</Text>
        <RequestNotice request={state.detail} retry={reader.retryDetail} />
        {detail && state.detail.status === 'success' && <><Text style={s.title}>{detail.title}</Text>
          <Text style={s.text}>{detail.type} · {detail.role === 'OWNER' ? '소유자' : '편집자'} · {detail.pageCount}페이지</Text>
          {detail.canEdit && <Button label="다이어리 수정" onPress={()=>{reader.close();editing.editor.open(detail.id);}} />}
          <Text style={s.text}>계정 다이어리의 캔버스 편집은 준비 중이에요.</Text></>}
      </ScrollView>
    </Modal>
    {notificationOpen && notifications && <AuthenticatedNotificationDialog model={notifications} sharingPending onClose={() => setNotificationOpen(false)} />}
    {createOpen && <DiaryCreateModal key={formKey} blankOnly initialValues={creation.input}
      sheet={width<700} bottomInset={insets.bottom} saving={creation.status==='saving'}
      locked={!!creation.input||creation.status==='blocked'} submitDisabled={!!creation.input||creation.status==='blocked'}
      onSubmit={input=>creator.run(input)} onCancel={()=>setCreateOpen(false)}
      footerNotice={creation.error && <View style={s.notice}><Text accessibilityRole="alert" style={s.text}>{creation.error.message}</Text>
        {creation.canRetry && <Button label="같은 요청으로 다시 확인" onPress={creator.retry} />}
        {creation.status==='blocked' && <Button label="저장한 요청 다시 읽기" onPress={creator.load} />}
        <Button label="목록을 확인하고 요청 정리" onPress={()=>{setCreateOpen(false);setDiscardOpen(true);reader.refresh();}} />
      </View>} />}
    {editing.visible && !editing.source && <Modal visible onRequestClose={editing.editor.close}>
      <View style={s.detail}><Button label="수정 닫기" onPress={editing.editor.close} />
        <RequestNotice request={{status:editing.loadStatus,error:editing.loadError}} retry={editing.editor.retryLoad} /></View>
    </Modal>}
    {editing.source && <DiaryCreateModal key={editing.source.id} diary={editing.source} visible={editing.visible}
      metadataOnly titleLimit={100} sheet={width<700} bottomInset={insets.bottom} submitLabel="변경 저장"
      saving={editing.mutation.status==='saving'} locked={editing.mutation.canRetry || editing.permissionBlocked}
      submitDisabled={editing.needsReview || editing.permissionBlocked || editing.latestStatus==='loading'}
      messageResetKey={editing.latest?.version} onCancel={editing.editor.close}
      onSubmit={async form=>{try {await editing.editor.submit(form);return editing.editor.getSnapshot().mutation.error?.message;}catch(error){return error.message;}}}
      footerNotice={<View style={[s.notice,{maxHeight:180}]}><ScrollView>
        {editing.mutation.error && <Text accessibilityRole="alert" style={s.text}>{editing.mutation.error.message}</Text>}
        {editing.needsReview && <Button label="최신 정보 확인" onPress={editing.editor.refreshLatest} />}
        {editing.latestStatus==='loading' && <Text accessibilityLiveRegion="polite" style={s.text}>최신 정보를 확인하고 있어요.</Text>}
        {editing.latestError && <><Text accessibilityRole="alert" style={s.text}>{editing.latestError.message}</Text>
          {!editing.permissionBlocked && <Button label="최신 정보 다시 확인" onPress={editing.editor.refreshLatest} />}</>}
        {editing.latest && <Text accessibilityLiveRegion="polite" style={s.text}>현재 저장된 이름: {editing.latest.title}{'\n'}표지: {editing.latest.color} · {editing.latest.pattern || '무지'}{'\n'}입력한 내용은 유지했어요. 확인 후 변경 저장을 눌러 주세요.</Text>}
        {editing.mutation.canRetry && <Text style={s.text}>입력은 잠시 잠갔어요. 변경 저장을 누르면 같은 내용으로 결과를 다시 확인해요.</Text>}
      </ScrollView></View>} />}
    <ConfirmDialog largeControls open={!!purgeConfirm} title="영구 삭제할까요?"
      message={`“${(purgeConfirm?.title||'다이어리').slice(0,40)}”의 페이지·꾸미기·멤버 연결을 삭제해요. 복원할 수 없어요. 다른 자료에서 쓰는 미디어 원본은 유지해요.`}
      confirmLabel="영구 삭제" onCancel={()=>setPurgeConfirm(null)} onConfirm={()=>{
        if(purgeConfirm&&!actionBusy)lifecycle.run({kind:'permanentlyDelete',id:purgeConfirm.id});setPurgeConfirm(null);
      }} />
    <ConfirmDialog largeControls open={!!trashConfirm} title="휴지통으로 이동할까요?"
      message={`${trashConfirm?.title||'다이어리'}의 페이지와 멤버는 유지돼요. 공유 다이어리는 모든 멤버의 보관함에서 숨겨지고, 소유자가 30일 안에 복원할 수 있어요.`}
      confirmLabel="휴지통으로 이동" onCancel={()=>setTrashConfirm(null)} onConfirm={()=>{
        if(trashConfirm&&!actionBusy)lifecycle.run({kind:'trash',id:trashConfirm.id});setTrashConfirm(null);
      }} />
    <ConfirmDialog open={discardOpen} danger={false} title="이전 요청을 정리할까요?"
      message="서버에는 이미 만들어졌을 수 있어요. 취소를 누르고 목록을 먼저 확인해 주세요. 요청을 정리하면 다음 생성은 새 다이어리를 만들어요."
      confirmLabel="요청 정리" onCancel={()=>setDiscardOpen(false)} onConfirm={async()=>{await creator.discard();setDiscardOpen(false);}} />
  </View>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas }, toolbar: { padding: 12, gap: 8, backgroundColor: C.white },
  title: { fontSize: 20, fontWeight: '600', color: C.ink }, text: { fontSize: 14, color: C.ink },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, justifyContent: 'center', backgroundColor: C.pale },
  notice: { padding: 12, gap: 8 }, detail: { padding: 20, gap: 16, flexGrow: 1, backgroundColor: C.white },
});
