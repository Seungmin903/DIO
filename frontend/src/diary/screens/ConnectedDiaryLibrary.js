import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Modal from '../../editor/components/controls/EditorModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../constants';
import { TOOL_CONTENT_GAP, toolMaxHeight } from '../../devtools/layout';
import LibraryScreen from './LibraryScreen';
import DiaryMutationPanel from './DiaryMutationPanel';
import { useDiaryQuery } from '../hooks/useDiaryQuery';
import { createDiaryApi } from '../services/diaryApi';
import { createMockDiaryTransport } from '../services/mockDiaryTransport';

function Button({ label, onPress }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.button]}><Text style={styles.text}>{label}</Text></Pressable>;
}
function RequestState({ request, retryLabel }) {
  if (request.status === 'loading') return <View accessibilityLiveRegion="polite" style={styles.row}><ActivityIndicator color={C.blue} /><Text style={styles.text}>불러오는 중이에요.</Text></View>;
  if (request.status !== 'error') return null;
  return <View accessibilityLiveRegion="polite" style={styles.row}><Text style={styles.text}>{request.error.message}</Text><Button label={retryLabel} onPress={request.retry} /></View>;
}

// 목 연결 준비 화면. 앱의 로컬 useDiaries/편집 문서를 마운트하지 않는다.
// 실 서버 연결 시 transport만 교체하고 인증 사용자별로 이 컴포넌트를 key로 분리한다.
export default function ConnectedDiaryLibrary() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const mock = useMemo(() => createMockDiaryTransport(), []);
  const api = useMemo(() => createDiaryApi(mock.transport), [mock]);
  const list = useDiaryQuery(api.list);
  const detail = useDiaryQuery(api.get);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('updated');
  const [view, setView] = useState('grid');
  const [carousel, setCarousel] = useState(0);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsMounted, setToolsMounted] = useState(false);
  const [scenario, setScenario] = useState('success');
  useEffect(() => { list.run(); }, [list.run]);
  const metadata = useMemo(() => Object.fromEntries((list.data?.items || []).map(row => [row.id, { pageCount: row.pageCount }])), [list.data]);
  const open = row => { detail.reset(); setSelected(row.id); detail.run(row.id); };
  const close = () => { detail.reset(); setSelected(null); };
  const selectScenario = value => { mock.setScenario(value); setScenario(value); close(); list.reset(); list.run(); };
  return <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <View style={styles.panel}>
      <Text accessibilityRole="header" style={styles.title}>개발·테스트 화면 / API 응답 검증</Text>
      <Text style={styles.text}>샘플 데이터 · 실제 서버에 연결하지 않아요.</Text>
      <Button label={toolsOpen ? "테스트 도구 닫기" : "테스트 도구 열기"} onPress={() => { setToolsMounted(true); setToolsOpen(value => !value); }} />
      {toolsMounted && <ScrollView testID="api-mock-controls" style={[{ maxHeight: toolMaxHeight(height) }, !toolsOpen && styles.hidden]} contentContainerStyle={styles.toolsContent}>
      <DiaryMutationPanel api={api} mock={mock} diaries={list.data?.items || []} onChanged={list.run} />
      <ScrollView horizontal contentContainerStyle={styles.row}>
        {[['success', '정상'], ['fail-once', '한 번 실패'], ['error', '계속 실패'], ['empty', '빈 목록'], ['not-found', '상세 없음']].map(([value, label]) => <Button key={value} label={`${scenario === value ? '✓ ' : ''}${label}`} onPress={() => selectScenario(value)} />)}
        <Button label="목록 새로고침" onPress={() => list.run()} />
      </ScrollView>
      </ScrollView>}
      <RequestState request={list} retryLabel="목록 다시 시도" />
    </View>
    {list.data && <LibraryScreen compact={width < 700} diaries={list.data.items} metadata={metadata} sort={sort} onSortChange={setSort} filter={filter} view={view} carousel={carousel} onFilterChange={setFilter} onViewChange={setView} onCarouselChange={setCarousel} onOpen={open} />}
    <Modal visible={selected !== null} onRequestClose={close} animationType="none">
      <ScrollView contentContainerStyle={[styles.panel, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <Button label="상세 닫기" onPress={close} />
        <Text style={styles.title}>다이어리 상세</Text>
        <RequestState request={detail} retryLabel="상세 다시 시도" />
        {detail.data && <View style={styles.panel}><Text style={styles.title}>{detail.data.title}</Text><Text style={styles.text}>{detail.data.type} · {detail.data.pageCount}페이지</Text><Text style={styles.text}>이 테스트 화면은 상세 조회까지만 확인해요. 실제 편집기는 일반 앱에서 열어 주세요.</Text></View>}
      </ScrollView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  hidden: { display: 'none' },
  toolsContent: { gap: TOOL_CONTENT_GAP },
  root: { flex: 1, backgroundColor: C.canvas },
  panel: { padding: 20, gap: 12, backgroundColor: C.white },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 44, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12, backgroundColor: C.pale },
  text: { color: C.ink, fontSize: 14 },
  title: { color: C.ink, fontSize: 20, fontWeight: '600' },
});
