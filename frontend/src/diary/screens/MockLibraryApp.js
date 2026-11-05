import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Modal from '../../editor/components/controls/EditorModal';
import ConfirmDialog from '../../editor/components/controls/ConfirmDialog';
import { fitTabletFrame } from '../../shared/layout';
import { useFormFactor } from '../../shared/useFormFactor';
import { C } from '../constants';
import { toolMaxHeight } from '../../devtools/layout';
import { styles as shell } from '../styles';
import SideRail, { RAIL_WIDTH } from '../components/SideRail';
import BottomTabs from '../components/BottomTabs';
import DiaryCreateModal from '../components/DiaryCreateModal';
import LibraryScreen from './LibraryScreen';
import TrashScreen from './TrashScreen';
import { useDiaryQuery } from '../hooks/useDiaryQuery';
import { useLibraryReader } from '../hooks/useLibraryReader';
import { useDiaryMutation } from '../hooks/useDiaryMutation';
import { useDiaryEditor } from '../hooks/useDiaryEditor';
import { createDiaryCommand } from '../services/diaryMutation';
import { diaryCreateInput } from '../services/diaryCreateInput';
import { DISABLED_OPACITY } from '../../shared/theme';
import { createDiaryApi } from '../services/diaryApi';
import { createMockDiaryTransport } from '../services/mockDiaryTransport';
import MockNotifications from '../../notifications/MockNotifications';

function Button({ label, onPress, disabled = false, selected }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} aria-pressed={selected} accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, selected && s.buttonSelected, disabled && { opacity: DISABLED_OPACITY }]}><Text style={s.text}>{selected ? '✓ ' : ''}{label}</Text></Pressable>;
}
function Notice({ state, retry, detail = false }) {
  if (state.status === 'loading' || state.status === 'idle') return <View accessibilityLiveRegion="polite" style={s.row}><ActivityIndicator color={C.blue} /><Text style={s.text}>불러오는 중이에요.</Text></View>;
  if (state.status !== 'error') return null;
  return <View accessibilityLiveRegion="polite" style={s.notice}>
    <Text style={s.text}>{state.error.message}</Text>
    {state.data && <Text style={s.text}>이전 조회 결과를 표시하고 있어요.</Text>}
    <Button label={detail ? '상세 다시 시도' : '목록 다시 시도'} onPress={retry} />
  </View>;
}

export default function MockLibraryApp() {
  const [account, setAccount] = useState('A');
  const [notifications, setNotifications] = useState(false);
  return <>
    <RemoteLibrary key={account} account={account} onOpenNotifications={() => setNotifications(true)} onSwitchAccount={() => setAccount(value => value === 'A' ? 'B' : 'A')} />
    <Modal visible={notifications} onRequestClose={() => setNotifications(false)} animationType="none">
      {notifications && <MockNotifications onClose={() => setNotifications(false)} />}
    </Modal>
  </>;
}

const EMPTY_ROWS = [];

function RemoteLibrary({ account, onSwitchAccount, onOpenNotifications }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { isPhone } = useFormFactor();
  const [viewport, setViewport] = useState({ width, height });
  const frame = isPhone ? null : fitTabletFrame(viewport.width, viewport.height);
  const mock = useMemo(() => createMockDiaryTransport(account === 'A' ? {} : { initialRows: [{
    diaryId: 'mock-account-b', diaryTitle: '다른 계정 일기', coverColor: '#B2AFD5', visibility: 'PRIVATE',
    pageCount: 3, version: '1', canEdit: true, myMembership: { isFavorite: true }, createdAt: '2026-10-24T03:00:00Z', updatedAt: '2026-10-24T03:00:00Z',
  }] }), [account]);
  const api = useMemo(() => createDiaryApi(mock.transport), [mock]);
  const { list, detail, selectedId, more, moreRequiresRefresh, reader } = useLibraryReader(api, account);
  const [pagination, setPagination] = useState(false);
  const execute = useMemo(() => createDiaryCommand(api), [api]);
  const creation = useDiaryMutation(execute);
  const removal = useDiaryMutation(execute);
  const loadTrash = useCallback(options => api.list({ ...options, query: { status: 'trashed' } }), [api]);
  const trash = useDiaryQuery(loadTrash);
  const [selection, setSelection] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [removalRefreshing, setRemovalRefreshing] = useState(false);
  const removalBusy = removal.status === 'saving' || removalRefreshing;
  const removalLocked = removalBusy || removal.canRetry;
  const removalRunning = useRef(false);
  const [cleanup, setCleanup] = useState({ status: 'idle', error: null });
  const failCleanupOnce = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const editing = useDiaryEditor(api);
  const editSaving = editing.mutation.status === 'saving';
  const [createMounted, setCreateMounted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [writeMode, setWriteMode] = useState('success');
  // Fast Refresh가 목 인스턴스만 다시 만들더라도 화면의 선택과 실제 설정을 맞춘다.
  useEffect(() => { mock.setWriteScenario(writeMode); }, [mock, writeMode]);
  const [createdMessage, setCreatedMessage] = useState('');
  const saving = creation.status === 'saving';
  const [options, setOptions] = useState({ filter: 'all', query: '', sort: 'updated' });
  const [searchOpen, setSearchOpen] = useState(false);
  const [view, setView] = useState('carousel');
  const [carousel, setCarousel] = useState(0);
  const [page, setPage] = useState('library');
  const [collapsed, setCollapsed] = useState(true);  const [controlsOpen, setControlsOpen] = useState(false);
  const [scenario, setScenario] = useState('success');
  const railWidthRef = useRef(RAIL_WIDTH.collapsed);
  // 메뉴는 메인 화면 위에 겹쳐 열리므로 메인 화면을 비켜 주는 폭은 늘 접힌 폭이다.
  useEffect(() => {
    const sub = AppState.addEventListener('change', value => { if (value === 'active') { reader.refresh(); if (page === 'trash') trash.run(); } });
    return () => sub.remove();
  }, [reader, page, trash.run]);
  const change = useCallback(patch => {
    setSelection(null);
    setOptions(previous => ({ ...previous, ...patch }));
    setCarousel(0);
  }, []);
  useEffect(() => { reader.load(options); }, [options, reader]);
  useEffect(() => { if (page === 'trash') trash.run(); }, [page, trash.run]);
  const navigate = (next, filter) => {
    if (removalBusy) return;
    reader.close(); setPage(next); setSearchOpen(false); setSelection(null);
    if (next === 'library') change({ filter: filter || 'all', query: '' });
  };
  const rows = list.data?.items || [];
  const trashItems = trash.data?.items || EMPTY_ROWS;
  const askRemoval = (kind, ids) => {
    if (removalRunning.current || removal.getSnapshot().status === 'saving' || removal.getPendingInput()) return;
    removal.dismiss();
    const visible = kind === 'trash' ? rows : trash.data?.items || [];
    const targets = visible.filter(row => ids.includes(row.id)
      && (kind !== 'restore' || row.canRestore)
      && (kind !== 'permanentlyDelete' || row.trashedAt));
    if (targets.length) setConfirmation({ kind, ids: targets.map(row => row.id), titles: targets.map(row => row.title) });
  };
  const performRemoval = async (retry = false) => {
    if (removalRunning.current) return;
    const intent = confirmation;
    if (!retry && !intent) return;
    removalRunning.current = true; setRemovalRefreshing(true); setConfirmation(null); reader.close();
    try {
      if (retry) await removal.retry();
      else await removal.run({ kind: intent.kind, ids: intent.ids });
      if (!alive.current) return;
      const result = removal.getSnapshot();
      setSelection(current => current === null ? null : current.filter(id => !result.result?.succeeded?.includes(id)));
      // 저장 결과와 재조회 오류를 분리하고 성공한 ID는 다시 보내지 않는다.
      await Promise.all([reader.refresh(), trash.run()]);
    } finally { removalRunning.current = false; if (alive.current) setRemovalRefreshing(false); }
  };
  // 개발용 목 서버 작업을 수동 실행한다. 기기 타이머/로컬 파일 삭제와 연결하지 않는다.
  const runMockCleanup = async () => {
    if (removalRunning.current || removal.getPendingInput()) return;
    removalRunning.current = true; setRemovalRefreshing(true); setCleanup({ status: 'saving', error: null });
    try {
      await Promise.resolve();
      if (failCleanupOnce.current) { failCleanupOnce.current = false; throw new Error('목 서버 만료 정리에 실패했어요. 자료는 유지했어요. 다시 시도해 주세요.'); }
      mock.purgeExpired();
      if (!alive.current) return;
      setCleanup({ status: 'success', error: null });
      await Promise.all([reader.refresh(), trash.run()]);
    } catch (error) { if (alive.current) setCleanup({ status: 'error', error: error.message }); }
    finally { removalRunning.current = false; if (alive.current) setRemovalRefreshing(false); }
  };
  const openCreate = () => { reader.close(); setCreatedMessage(''); setCreateMounted(true); setCreateOpen(true); };
  const closeCreate = () => {
    if (saving) return;
    creation.dismiss(); setCreateOpen(false);
    if (!creation.getPendingInput()) setCreateMounted(false);
  };
  const submitCreate = async form => {
    if (creation.getSnapshot().status === 'saving') return;
    if (creation.getPendingInput()) await creation.retry();
    else {
      let values;
      try { values = diaryCreateInput(form); } catch (error) { return error.message; }
      await creation.run({ kind: 'create', values });
    }
    const result = creation.getSnapshot();
    if (result.status !== 'success') return result.error?.message || '저장 결과를 확인하지 못했어요. 다시 시도해 주세요.';
    setCreateOpen(false); setCreateMounted(false);
    setCreatedMessage(`“${result.result.title}”를 만들었어요. 첫 페이지 편집 연결은 다음 단계에서 제공해요.`);
    creation.dismiss();
    await reader.refreshAndOpen(result.result.id);
  };
  const openEdit = row => {
    if (!row.canEdit) return;
    reader.close(); setCreatedMessage(''); editing.editor.open(row.id);
  };
  const submitEdit = async form => {
    try { await editing.editor.submit(form); } catch (error) { return error.message; }
    const result = editing.editor.getSnapshot().mutation;
    if (result.status !== 'success') return result.error?.message || '최신 내용을 확인한 뒤 저장해 주세요.';
    editing.editor.close();
    setCreatedMessage(`“${result.result.title}”를 수정했어요.`);
    await reader.refreshAndOpen(result.result.id);
  };
  const editLocked = editSaving || editing.mutation.canRetry || editing.needsReview || editing.permissionBlocked || editing.latestStatus === 'loading';
  const notice = <View style={s.notice}>
    <Notice state={list} retry={reader.refresh} />
    {pagination && list.data && <Text style={s.text}>{`${rows.length}개 불러왔어요.${list.data.hasNext ? ' 더 불러올 수 있어요.' : ' 마지막 목록이에요.'}`}</Text>}
    {more.status === 'loading' && <View accessibilityLiveRegion="polite" style={s.row}><ActivityIndicator color={C.blue} /><Text style={s.text}>다음 목록을 불러오는 중이에요.</Text></View>}
    {more.status === 'error' && <Text accessibilityLiveRegion="polite" style={s.text}>{more.error.message}</Text>}
    {list.data?.hasNext && <Button label={moreRequiresRefresh ? '목록 새로고침으로 복구' : more.status === 'error' ? '더 보기 다시 시도' : '다이어리 더 보기'}
      onPress={more.status === 'error' ? reader.retryMore : reader.loadMore}
      disabled={removalLocked || list.status !== 'success' || more.status === 'loading'} />}
  </View>;
  const library = <LibraryScreen compact={isPhone} diaries={rows} filter={options.filter} sort={options.sort}
    onSortChange={sort => change({ sort })} onFilterChange={filter => change({ filter })}
    view={view} onViewChange={setView} carousel={carousel} onCarouselChange={setCarousel}
    railWidthRef={isPhone ? null : railWidthRef} onOpen={row => reader.open(row.id)}
    onCreate={openCreate}
    onEdit={openEdit}
    onDelete={removalLocked ? undefined : row => askRemoval('trash', [row.id])}
    selection={selection} onSelectionChange={value => { if (!removalLocked) setSelection(value); }}
    onTrashSelected={ids => askRemoval('trash', ids)} trashing={removalLocked}
    remoteQuery={{ query: options.query, searchOpen, onQueryChange: query => change({ query }), onSearchOpenChange: value => { reader.close(); setSearchOpen(value); } }}
    requestNotice={notice} hasMore={Boolean(list.data?.hasNext)} suppressEmpty={list.status !== 'success'} historyKey={`dio:qa:mock-library:search:${account}`} />;
  const content = <View style={shell.workspace}>
    <View style={s.notice}><Text style={s.text}>샘플 데이터 · 실제 서버에 연결하지 않아요. 아래는 서비스 화면을 사용하는 테스트 영역이에요.</Text></View>
    <View style={s.banner}>
      <Text style={s.text}>{`개발·테스트 화면 / 보관함 · 샘플 계정 ${account}`}</Text>
      <Button label="알림 연결 검증" onPress={onOpenNotifications} />
      <Button label="목록 새로고침" onPress={page === 'trash' ? () => trash.run() : reader.refresh} disabled={removalBusy} />
      <Button label={controlsOpen ? '목 응답 설정 닫기' : '목 응답 설정'} onPress={() => setControlsOpen(value => !value)} />
    </View>
    {controlsOpen && <ScrollView testID="library-mock-controls" style={[s.controls, { maxHeight: toolMaxHeight(height) }]} contentContainerStyle={s.notice}>
      <Text accessibilityRole="header" style={s.text}>조회 응답 · 샘플 계정</Text>
      <ScrollView horizontal contentContainerStyle={s.row}>
        {[['success', '정상'], ['fail-once', '한 번 실패'], ['error', '계속 실패'], ['empty', '빈 목록'], ['not-found', '상세 없음']].map(([value, label]) =>
          <Button key={value} label={`${scenario === value ? '✓ ' : ''}${label}`} disabled={removalBusy} onPress={() => { mock.setScenario(value); setScenario(value); reader.close(); reader.refresh(); if (page === 'trash') trash.run(); }} />)}
        <Button label="샘플 계정 변경" disabled={removalBusy} onPress={onSwitchAccount} />
      </ScrollView>
      <Text style={s.text}>목 데이터로 조회·생성·수정·휴지통·영구 삭제를 확인해요. 실제 서버에는 연결하지 않았어요.</Text>
      <Text accessibilityRole="header" style={s.text}>목록 더 보기</Text>
      <ScrollView horizontal contentContainerStyle={s.row}>
        <Button label={pagination ? '페이지 나누기 끄기' : '페이지 나누기 켜기'} disabled={removalLocked} onPress={() => {
          mock.setPagination(!pagination); setPagination(!pagination); reader.close(); reader.refresh();
        }} />
        <Button label="더 보기 정상" disabled={removalLocked} onPress={() => mock.setMoreScenario('success')} />
        <Button label="더 보기 한 번 실패" disabled={removalLocked} onPress={() => mock.setMoreScenario('fail-once')} />
        <Button label="더 보기 커서 무효화" disabled={removalLocked || !list.data?.hasNext} onPress={mock.invalidateCursors} />
      </ScrollView>
      {pagination && <Text style={s.text}>활성 보관함을 두 개씩 조회해요. 샘플 네 개가 추가되며 끄면 추가 샘플도 한 번에 표시해요. 새로 열면 초기화돼요.</Text>}
      <Text accessibilityRole="header" style={s.text}>이동·복원·삭제 응답</Text>
      <ScrollView horizontal contentContainerStyle={s.row}>
        {[['success', '이동·복원 정상'], ['fail-once', '이동·복원 한 번 실패'], ['partial', '일괄 부분 실패'], ['forbidden', '이동·복원 권한 없음'], ['response-lost', '이동·복원 응답 유실'], ['expired', '복원 기한 만료']].map(([value, label]) =>
          <Button key={value} label={label} selected={writeMode === value} disabled={removalBusy} onPress={() => { mock.setWriteScenario(value); setWriteMode(value); }} />)}
      </ScrollView>
      {writeMode === 'fail-once' && <Text style={s.text}>선택 후 첫 저장·이동·복원·영구 삭제 요청 한 번만 실패해요. 다시 시험하려면 이 옵션을 다시 눌러 주세요.</Text>}
      {page === 'trash' && <View style={s.notice}>
        <Text style={s.text}>개발용 목 서버 작업이에요. 실제 보관 기간이나 기기 날짜를 바꾸지 않아요.</Text>
        <ScrollView horizontal contentContainerStyle={s.row}>
          <Button label="목 서버 30일 경과" disabled={removalLocked} onPress={() => { mock.advanceServerTime(30 * 86400000); trash.run(); }} />
          <Button label="목 서버 만료 정리" disabled={removalLocked} onPress={runMockCleanup} />
          <Button label="목 만료 정리 한 번 실패" disabled={removalLocked} onPress={() => { failCleanupOnce.current = true; setCleanup({ status: 'armed', error: null }); }} />
        </ScrollView>
        {cleanup.status === 'armed' && <Text style={s.text}>다음 목 서버 만료 정리 한 번만 실패해요.</Text>}
        {cleanup.status === 'saving' && <Text style={s.text}>목 서버에서 만료 항목을 정리하고 있어요.</Text>}
        {cleanup.status === 'success' && <Text style={s.text}>목 서버 만료 정리를 완료했어요. 목록 조회 상태도 확인해 주세요.</Text>}
        {cleanup.error && <><Text accessibilityLiveRegion="polite" style={s.text}>{cleanup.error}</Text><Button label="목 만료 정리 다시 시도" disabled={removalLocked} onPress={runMockCleanup} /></>}
      </View>}
    </ScrollView>}
    {!!createdMessage && <Text accessibilityLiveRegion="polite" style={s.notice}>{createdMessage}</Text>}
    {removal.status !== 'idle' && <View accessibilityLiveRegion="polite" style={s.notice}>
      {removalBusy ? <Text style={s.text}>처리 중이에요. 잠시 기다려 주세요.</Text> : <>
        {!!removal.result && <Text style={s.text}>{`처리 완료 ${removal.result.succeeded.length}개 · 실패 ${removal.result.failed.length}개`}</Text>}
        {!!removal.error && <Text style={s.text}>{removal.error.message}</Text>}
        {removal.result?.failed?.map(item => <Text key={item.id} style={s.text}>{`${item.id}: ${item.error.message}`}</Text>)}
        {removal.canRetry ? <Button label="실패 항목 다시 시도" onPress={() => performRemoval(true)} /> : <Button label="처리 결과 닫기" onPress={removal.dismiss} />}
      </>}
    </View>}
    {!createOpen && creation.canRetry && <View style={s.notice}>
      <Text style={s.text}>결과 확인이 필요한 생성 요청이 있어요.</Text>
      <Button label="생성 요청 이어서 확인" onPress={openCreate} />
    </View>}
    {!editing.visible && editing.mutation.canRetry && <View style={s.notice}>
      <Text style={s.text}>결과 확인이 필요한 수정 요청이 있어요.</Text>
      <Button label="수정 요청 이어서 확인" onPress={() => editing.editor.open(editing.source.id)} />
    </View>}
    {page === 'library' ? library : page === 'trash' ? <TrashScreen compact={isPhone} diaries={trashItems}
      serverMode busy={removalLocked} onRestore={id => askRemoval('restore', [id])}
      onDeletePermanently={row => askRemoval('permanentlyDelete', [row.id])}
      onRestoreMany={ids => askRemoval('restore', ids)}
      onDeleteMany={rows => askRemoval('permanentlyDelete', rows.map(row => row.id))}
      requestNotice={<Notice state={trash} retry={() => trash.retry()} />} suppressEmpty={trash.status !== 'success'} /> : <View style={shell.screen}>
      <Text style={s.title}>{page === 'trash' ? '휴지통' : '내 공간'}</Text>
      <Text style={s.text}>이 목 모드에서는 보관함 조회만 연결되어 있어요.</Text>
      <Button label="보관함으로 돌아가기" onPress={() => navigate('library', 'all')} />
    </View>}
  </View>;
  return <View style={[shell.safe, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
    <ConfirmDialog open={!!confirmation} title={confirmation?.kind === 'restore' ? '다이어리를 복원할까요?' : confirmation?.kind === 'permanentlyDelete' ? '영구 삭제할까요?' : '휴지통으로 옮길까요?'}
      message={confirmation ? `${confirmation.titles.join(', ')} · ${confirmation.ids.length}개${confirmation.kind === 'trash' ? '\n30일 동안 복원할 수 있어요.' : confirmation.kind === 'permanentlyDelete' ? '\n영구 삭제하면 복원할 수 없어요.' : ''}` : ''}
      confirmLabel={confirmation?.kind === 'restore' ? '복원하기' : confirmation?.kind === 'permanentlyDelete' ? '영구 삭제하기' : '휴지통으로 옮기기'} danger={confirmation?.kind !== 'restore'}
      onCancel={() => setConfirmation(null)} onConfirm={() => performRemoval()} />
    <View style={shell.viewport} onLayout={({ nativeEvent: { layout } }) => setViewport({ width: layout.width, height: layout.height })}>
      <View style={[shell.app, frame ? { width: frame.width, height: frame.height } : shell.appFill]}>
        {isPhone ? <View style={shell.phoneShell}><View style={shell.workspace}>{content}</View><BottomTabs page={page} filter={options.filter} navigate={navigate} bottomInset={insets.bottom} /></View>
          : <View style={shell.shell}><SideRail page={page} filter={options.filter} navigate={navigate} collapsed={collapsed} onToggle={() => setCollapsed(value => !value)} bottomInset={insets.bottom} />{content}</View>}
      </View>
    </View>
    {createMounted && <DiaryCreateModal visible={createOpen} sheet={isPhone} bottomInset={insets.bottom}
      saving={saving} locked={creation.canRetry} submitLabel={creation.canRetry ? '같은 입력 다시 저장' : undefined}
      onSubmit={submitCreate} onCancel={closeCreate}
      footerNotice={<View style={s.notice}>
        {creation.canRetry && <Text style={s.text}>입력과 요청 키를 유지했어요. 같은 요청으로 결과를 확인해요.</Text>}
        <ScrollView horizontal contentContainerStyle={s.row}>
          {[['success', '저장 정상'], ['fail-once', '저장 한 번 실패'], ['error', '저장 계속 실패'], ['forbidden', '권한 없음'], ['response-lost', '응답 유실']].map(([value, label]) =>
            <Button key={value} label={`${writeMode === value ? '✓ ' : ''}${label}`} disabled={saving} onPress={() => { mock.setWriteScenario(value); setWriteMode(value); }} />)}
        </ScrollView>
      </View>} />}
    <Modal visible={editing.visible && !editing.source} onRequestClose={editing.editor.close} animationType="none">
      <View style={[s.detail, { paddingTop: insets.top + 20 }]}>
        <Button label="수정 정보 닫기" onPress={editing.editor.close} />
        <Text style={s.title}>수정할 다이어리 확인</Text>
        {editing.loadStatus === 'loading' ? <ActivityIndicator color={C.blue} /> : <>
          <Text style={s.text}>{editing.loadError?.message}</Text>
          <Button label="수정 정보 다시 시도" onPress={editing.editor.retryLoad} />
        </>}
      </View>
    </Modal>
    {editing.source && <DiaryCreateModal key={editing.source.id} diary={editing.source} visible={editing.visible}
      sheet={isPhone} bottomInset={insets.bottom} saving={editSaving} locked={editLocked}
      submitLabel={editing.mutation.canRetry ? '같은 입력 다시 저장' : undefined}
      submitDisabled={editing.needsReview || editing.permissionBlocked || editing.latestStatus === 'loading'}
      messageResetKey={editing.latest} onSubmit={submitEdit} onCancel={editing.editor.close}
      footerNotice={<View style={s.notice}>
        {editing.mutation.canRetry && <Text style={s.text}>입력과 요청 키를 유지했어요. 같은 요청으로 결과를 확인해요.</Text>}
        {editing.needsReview && <Button label="입력 유지하고 최신 내용 확인" onPress={editing.editor.refreshLatest} disabled={editing.latestStatus === 'loading'} />}
        {editing.permissionBlocked && <><Text style={s.text}>권한이 확인될 때까지 저장할 수 없어요.</Text><Button label="권한 다시 확인" onPress={editing.editor.refreshLatest} disabled={editing.latestStatus === 'loading'} /></>}
        {editing.latestStatus === 'loading' && <Text style={s.text}>최신 정보를 확인하고 있어요.</Text>}
        {editing.latestStatus === 'error' && <><Text style={s.text}>{editing.latestError?.message}</Text><Button label="최신 내용 다시 조회" onPress={editing.editor.refreshLatest} /></>}
        {editing.latestStatus === 'success' && <Text style={s.text}>{`최신 이름: ${editing.latest.title} · 표지 색: ${editing.latest.color} · 패턴: ${editing.latest.pattern || '없음'}. 입력한 내용은 유지했어요. 비교한 뒤 저장해 주세요.`}</Text>}
        <ScrollView horizontal contentContainerStyle={s.row}>
          {[['success', '저장 정상'], ['fail-once', '저장 한 번 실패'], ['error', '저장 계속 실패'], ['forbidden', '권한 없음'], ['conflict', '버전 충돌'], ['response-lost', '응답 유실']].map(([value, label]) =>
            <Button key={value} label={`${writeMode === value ? '✓ ' : ''}${label}`} disabled={editSaving} onPress={() => {
              if (value === 'conflict') mock.simulateEdit(editing.source.id, { diaryTitle: '다른 기기에서 수정한 이름', coverColor: '#B2AFD5', coverPattern: 'STRIPE' });
              mock.setWriteScenario(value); setWriteMode(value);
            }} />)}
        </ScrollView>
      </View>} />}
    <Modal visible={selectedId !== null} onRequestClose={reader.close} animationType="none">
      <ScrollView contentContainerStyle={[s.detail, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <Button label="상세 닫기" onPress={reader.close} />
        <Text style={s.title}>다이어리 상세</Text>
        <Notice state={detail} retry={reader.retryDetail} detail />
        {detail.data && <><Text style={s.title}>{detail.data.title}</Text><Text style={s.text}>{detail.data.type} · {detail.data.pageCount}페이지</Text>
          <Text style={s.text}>이 테스트 화면은 상세 조회까지만 확인해요. 실제 편집기는 일반 앱에서 열어 주세요.</Text></>}
      </ScrollView>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  controls: { flexGrow: 0 },
  banner: { padding: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, backgroundColor: C.white },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notice: { gap: 8, padding: 12, backgroundColor: C.white },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.pale },
  buttonSelected: { borderWidth: 2, borderColor: C.blue },
  text: { color: C.ink, fontSize: 14 }, title: { color: C.ink, fontSize: 20, fontWeight: '700' },
  detail: { padding: 20, gap: 12, backgroundColor: C.white, flexGrow: 1 },
});
