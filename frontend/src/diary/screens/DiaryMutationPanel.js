import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Modal from '../../editor/components/controls/EditorModal';
import ConfirmDialog from '../../editor/components/controls/ConfirmDialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../constants';
import { DISABLED_OPACITY } from '../../shared/theme';
import { useDiaryMutation } from '../hooks/useDiaryMutation';
import { useDiaryQuery } from '../hooks/useDiaryQuery';
import { createDiaryCommand } from '../services/diaryMutation';

function Button({ label, onPress, disabled = false }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.button, disabled && { opacity: DISABLED_OPACITY }]}><Text style={s.text}>{label}</Text></Pressable>;
}
// 210·211·204의 완성 UI와 분리된 개발용 검증기. 실제 화면은 동일 command/hook을 주입한다.
export default function DiaryMutationPanel({ api, mock, diaries, onChanged }) {
  const insets = useSafeAreaInsets();
  const execute = useMemo(() => createDiaryCommand(api), [api]);
  const mutation = useDiaryMutation(execute);
  const loadTrash = useMemo(() => options => api.list({ ...options, query: { status: 'trashed' } }), [api]);
  const trash = useDiaryQuery(loadTrash);
  const latest = useDiaryQuery(api.get);
  const [kind, setKind] = useState(null);
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState('');
  const [ids, setIds] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [permanentSelection, setPermanentSelection] = useState(null);
  const [writeMode, setWriteMode] = useState('success');
  const [validation, setValidation] = useState('');
  const saving = mutation.status === 'saving';
  const locked = saving || ['error', 'partial', 'success'].includes(mutation.status);
  const batch = ['trash', 'restore', 'permanentlyDelete'].includes(kind);
  const trashMode = kind === 'restore' || kind === 'permanentlyDelete';
  const source = trashMode ? (trash.data?.items || []) : diaries;
  useEffect(() => {
    if (!['success', 'partial'].includes(mutation.status)) return;
    onChanged(); trash.run();
    if (mutation.result?.failed) setIds(mutation.result.failed.map(item => item.id));
  }, [mutation.status, mutation.result, onChanged, trash.run]);
  useEffect(() => {
    if (latest.status === 'success') { setEditing(latest.data); mutation.reset(); }
  }, [latest.status, latest.data, mutation.reset]);
  const open = value => {
    const pending = mutation.getPendingInput();
    if (pending) {
      latest.reset(); setKind(pending.kind); setTitle(pending.values?.title || '');
      setEditing(pending.id ? { ...pending.values, id: pending.id } : null);
      setIds(pending.ids || []); setPermanentSelection(null);
      setValidation('이전 요청의 결과 확인이 필요해요. 같은 요청으로 다시 확인해 주세요.');
      return;
    }
    mutation.reset(); latest.reset(); setKind(value); setTitle(''); setEditing(null); setIds([]); setConfirmed(false); setPermanentSelection(null); setValidation('');
    if (value === 'restore' || value === 'permanentlyDelete') trash.run();
  };
  const close = () => { if (saving) return; mutation.dismiss(); latest.reset(); setPermanentSelection(null); setKind(null); };
  const submit = () => {
    if (locked) return;
    if (!batch && !title.trim()) { setValidation('제목을 입력해 주세요.'); return; }
    if (kind === 'update' && !editing) return;
    if (batch && (!ids.length || (kind !== 'permanentlyDelete' && !confirmed))) return;
    if (kind === 'permanentlyDelete') { setPermanentSelection([...ids]); return; }
    setValidation('');
    mutation.run(batch ? { kind, ids } : { kind, id: editing?.id, values: {
      title: title.trim(), color: editing?.color || C.canvas, version: editing?.version,
      // 첫 페이지 생성은 제안 계약 검증용. 실제 템플릿 ID/설정은 229 합의 후 연결한다.
      initialPages: [{ templateId: 'mock-template', config: {} }],
    } });
  };
  return <>
    {mutation.canRetry && kind === null && <Text style={s.text}>결과 확인이 필요한 요청이 있어요. 작업을 열면 이전 요청을 이어서 확인해요.</Text>}
    <ScrollView horizontal contentContainerStyle={s.row}>
      {[['create', '목 생성'], ['update', '목 수정'], ['trash', '목 휴지통 이동'], ['restore', '목 복원'], ['permanentlyDelete', '목 영구 삭제']].map(([value, label]) => <Button key={value} label={label} onPress={() => open(value)} />)}
    </ScrollView>
    <Modal visible={kind !== null} onRequestClose={close} animationType="none">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.panel, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <Button label="저장 검증 닫기" onPress={close} disabled={saving} />
        <Text style={s.title}>목 { {create: '생성', update: '수정', trash: '휴지통 이동', restore: '복원', permanentlyDelete: '영구 삭제'}[kind] } 검증</Text>
        <Text style={s.text}>샘플 데이터만 변경해요. 앱을 다시 열면 초기화돼요.</Text>
        <ScrollView horizontal contentContainerStyle={s.row}>
          {[['success', '저장 정상'], ['fail-once', '저장 한 번 실패'], ['error', '저장 계속 실패'], ['forbidden', '권한 없음'], ['conflict', '버전 충돌'], ['expired', '복원 만료'], ['partial', '일부 실패'], ['response-lost', '응답 유실']].map(([value, label]) => <Button key={value} label={`${writeMode === value ? '✓ ' : ''}${label}`} disabled={saving} onPress={() => { mock.setWriteScenario(value); setWriteMode(value); }} />)}
        </ScrollView>
        {(batch || kind === 'update') && source.map(row => batch
          ? <Pressable key={row.id} accessibilityRole="checkbox" accessibilityLabel={`${row.title} 선택`} accessibilityState={{ checked: ids.includes(row.id), disabled: locked || (kind === 'restore' && !row.canRestore) }} disabled={locked || (kind === 'restore' && !row.canRestore)} style={s.button} onPress={() => { setIds(current => current.includes(row.id) ? current.filter(id => id !== row.id) : [...current, row.id]); setConfirmed(false); }}><Text style={s.text}>{ids.includes(row.id) ? '☑' : '☐'} {row.title}{trashMode ? ` · ${row.retentionStatus === 'EXPIRED' ? '보관 기간 만료 · 복원 불가' : '보관 중'}` : ''}</Text></Pressable>
          : <Button key={row.id} label={`${row.title} 수정 선택`} disabled={locked} onPress={() => { setEditing(row); setTitle(row.title); }} />)}
        {trashMode && trash.status === 'loading' && <Text style={s.text}>휴지통 불러오는 중이에요.</Text>}
        {trashMode && trash.status === 'error' && <><Text style={s.text}>{trash.error.message}</Text><Button label="휴지통 다시 시도" onPress={trash.retry} /></>}
        {trashMode && trash.status === 'success' && !source.length && <Text style={s.text}>휴지통이 비어 있어요.</Text>}
        {trashMode && <View style={[s.row, { flexWrap: 'wrap' }]}>
          <Button label="휴지통 상태 새로고침" disabled={saving} onPress={() => trash.run()} />
          <Button label="목 서버 30일 경과" disabled={saving} onPress={() => { mock.advanceServerTime(30 * 86400000); trash.run(); }} />
          <Button label="목 서버 만료 정리" disabled={saving} onPress={() => { mock.purgeExpired(); trash.run(); }} />
        </View>}
        {kind === 'permanentlyDelete' && <Text style={s.text}>영구 삭제하면 복원할 수 없어요. 확인 후 처리해요.</Text>}
        {!batch && <TextInput accessibilityLabel="다이어리 제목" value={title} onChangeText={setTitle} editable={!locked} style={s.input} placeholder="제목" />}
        {!!validation && <Text style={s.text}>{validation}</Text>}
        {batch && kind !== 'permanentlyDelete' && <><Text style={s.text}>{ids.length}개 선택됨</Text><Button label={confirmed ? '처리 확인됨' : '선택 항목 처리 확인'} disabled={locked || !ids.length} onPress={() => setConfirmed(true)} /></>}
        <Button label={kind === 'permanentlyDelete' ? '선택 항목 영구 삭제' : '요청 저장'} onPress={submit} disabled={locked || (kind === 'update' && !editing) || (batch && ((!confirmed && kind !== 'permanentlyDelete') || !ids.length || (kind === 'restore' && ids.some(id => !source.find(row => row.id === id)?.canRestore))))} />
        {saving && <View style={s.row}><ActivityIndicator color={C.blue} /><Text style={s.text}>저장 중이에요.</Text></View>}
        {mutation.status === 'error' && <Text accessibilityLiveRegion="polite" style={s.text}>{mutation.error.message}</Text>}
        {kind === 'update' && mutation.error?.status === 409 && <Button label="입력 유지하고 최신 내용 확인" disabled={latest.status === 'loading'} onPress={() => latest.run(editing.id)} />}
        {latest.status === 'error' && <><Text style={s.text}>{latest.error.message}</Text><Button label="최신 내용 다시 조회" onPress={latest.retry} /></>}
        {latest.status === 'success' && <Text style={s.text}>최신 제목: {latest.data.title}. 입력한 제목은 유지했어요. 비교한 뒤 저장해 주세요.</Text>}
        {[400, 422].includes(mutation.error?.status) && <Button label="입력 다시 편집" onPress={mutation.reset} />}
        {mutation.status === 'partial' && <View><Text style={s.text}>{mutation.result.succeeded.length}개 성공 · {mutation.result.failed.length}개 실패</Text>{mutation.result.failed.map(item => <Text key={item.id} style={s.text}>{item.id}: {item.error.message}</Text>)}</View>}
        {mutation.canRetry && <Button label={batch ? '실패 항목 다시 시도' : '같은 입력 다시 저장'} onPress={mutation.retry} />}
        {mutation.status === 'success' && <Text accessibilityLiveRegion="polite" style={s.text}>요청을 완료했어요.</Text>}
        {mutation.status === 'error' && !mutation.canRetry && <Text style={s.text}>입력은 유지돼요. 창을 닫고 목록에서 최신 내용·권한을 확인한 뒤 다시 진행해 주세요.</Text>}
        {mutation.status === 'error' && mutation.canRetry && <Text style={s.text}>중복 생성을 막기 위해 같은 입력과 요청 키로 재시도해요.</Text>}
        {kind === 'create' && mutation.status === 'success' && <Text style={s.text}>첫 페이지 진입은 실제 페이지 응답 계약 확정 후 연결해요.</Text>}
      </ScrollView>
      <ConfirmDialog open={permanentSelection !== null} title="영구 삭제할까요?" message={`${permanentSelection?.length || 0}개 다이어리를 삭제하면 복원할 수 없어요.`} confirmLabel="영구 삭제" onCancel={() => setPermanentSelection(null)} onConfirm={() => {
        if (!permanentSelection || saving) return;
        const selectedIds = permanentSelection; setPermanentSelection(null);
        mutation.run({ kind: 'permanentlyDelete', ids: selectedIds });
      }} />
    </Modal>
  </>;
}
const s = StyleSheet.create({
  panel: { padding: 20, gap: 12, backgroundColor: C.white }, row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  button: { minHeight: 44, padding: 12, borderRadius: 12, backgroundColor: C.pale, justifyContent: 'center' },
  input: { minHeight: 44, padding: 12, borderWidth: 1, borderColor: C.line, color: C.ink, borderRadius: 12 },
  text: { color: C.ink, fontSize: 14 }, title: { color: C.ink, fontSize: 20, fontWeight: '600' },
});
