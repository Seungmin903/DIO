import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import EditorModal from '../editor/components/controls/EditorModal';
import EditorIcon from '../editor/components/controls/Icon';
import ConfirmDialog from '../editor/components/controls/ConfirmDialog';
import AppIcon from '../shared/AppIcon';
import BackButton from '../diary/components/BackButton';
import MemberAvatar from '../sharing/MemberAvatar';
import { useFormFactor } from '../shared/useFormFactor';
import { colors } from '../shared/theme';
import { pickEvidence } from './evidencePicker';
import { MAX_DESCRIPTION, MAX_PHOTOS, REPORT_REASONS, UNAVAILABLE, normalizeParticipants, validateReport } from './safetyModel';
import { safetyStyles as s } from './styles';
import { randomUUID } from 'expo-crypto';

export function SafetyButton({ children, label = children, onPress, secondary, disabled }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={Array.isArray(label) ? label.join('') : label} accessibilityState={{ disabled: Boolean(disabled) }}
    disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, disabled && s.disabled]}>
    <Text style={[s.buttonText, secondary && s.secondaryText]}>{children}</Text>
  </Pressable>;
}

function Person({ member, children }) {
  return <View style={s.row}>
    <View style={{ width: 40, height: 40, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}><MemberAvatar member={member} /></View>
    <View style={s.grow}><Text style={s.heading}>{member.nickname || '사용자'}</Text>{children}</View>
  </View>;
}
const blockMessage = '서로 이메일 초대를 보내거나 수락할 수 없어요.\n이미 함께하는 다이어리와 공동 작업은 그대로 유지돼요. 링크로는 안내를 확인한 뒤 다시 함께 참여할 수 있어요.';

export default function SafetyScreen({ request, user, store, state, onClose, onWarning, evidencePicker = pickEvidence }) {
  const { isPhone } = useFormFactor();
  const [screen, setScreen] = useState(request.kind);
  const [rows, setRows] = useState(() => normalizeParticipants(request.diary?.members));
  const [loading, setLoading] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [target, setTarget] = useState(request.target || null);
  const [menu, setMenu] = useState(request.target?.id || null);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [zoom, setZoom] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [question, setQuestion] = useState(null);
  const [dismiss, setDismiss] = useState(false);
  const [working, setWorking] = useState(false);
  const alive = useRef(true), locked = useRef(false), revision = useRef(0);
  const clientRequestId = useRef(null);
  const submittedDraft = useRef(null);
  const selfId = String(user?.userId || user?.accountId || user?.id || '');
  const unavailable = store.mode === 'unavailable';
  const preview = store.mode === 'preview';
  const busy = working || state.busy;
  const blocked = id => state.status === 'ready' ? state.blocks.some(row => row.id === id) : rows.some(row => row.id === id && row.blockedByMe === true);
  const dirty = Boolean(reason || description || photos.length);
  useEffect(() => { alive.current = true; return () => { alive.current = false; revision.current++; }; }, []);
  async function load() {
    const job = ++revision.current;
    setLoading(true); setMemberError('');
    try {
      const result = await store.participants(request.diary.sharedDiaryId || request.diary.id);
      if (alive.current && job === revision.current) setRows(result);
    } catch (failure) {
      if (alive.current && job === revision.current) setMemberError(unavailable ? '로그인 후 현재 참여자를 조회할 수 있어요.' : failure.message);
    } finally { if (alive.current && job === revision.current) setLoading(false); }
  }
  useEffect(() => {
    if (request.kind === 'participants') load();
    if (!unavailable) store.refresh();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  async function run(action) {
    if (locked.current) return;
    locked.current = true; setWorking(true); setError('');
    try { await action(); }
    catch (failure) { if (alive.current) setError(failure.message); }
    finally { locked.current = false; if (alive.current) setWorking(false); }
  }
  function back() {
    if (locked.current || state.busy) return;
    if (zoom) { setZoom(null); return; }
    if (question) { setQuestion(null); return; }
    if (screen === 'warning') { run(() => onWarning(false, false, request.rows, request.diary)); return; }
    if (screen === 'report' && dirty) { setQuestion({ kind: 'discard' }); return; }
    if (screen === 'report' || screen === 'complete') { clearDraft(); setScreen('participants'); return; }
    onClose();
  }
  function clearDraft() { clientRequestId.current = null; submittedDraft.current = null; setReason(''); setDescription(''); setPhotos([]); setError(''); }
  function restoreSubmittedDraft() {
    const draft = submittedDraft.current;
    if (!draft || busy) return;
    setReason(draft.reason); setDescription(draft.description); setPhotos(draft.photos.map(photo => ({ ...photo }))); setError('');
  }
  function startReport(member) { clearDraft(); setTarget(member); setMenu(null); setScreen('report'); }
  function askBlock(member) { setTarget(member); setError(''); setQuestion({ kind: blocked(member.id) ? 'unblock' : 'block', member }); }
  function confirm() {
    const current = question;
    setQuestion(null);
    if (current.kind === 'discard') { clearDraft(); setScreen('participants'); return; }
    run(async () => {
      if (current.kind === 'block') await store.block(current.member, request.diary.sharedDiaryId || request.diary.id); else await store.unblock(current.member);
      if (alive.current) {
        setMenu(null);
        setToast(preview ? '미리보기 상태를 변경했어요. 실제 계정에는 적용되지 않아요.' : current.kind === 'block' ? '사용자를 차단했어요' : '차단을 해제했어요');
      }
    });
  }
  async function submit() {
    const input = { targetUserId: target.id, diaryId: request.diary.sharedDiaryId || request.diary.id, reason, description: description.trim(), photos };
    const validation = validateReport(input);
    if (validation) { setError(validation); return; }
    if (!clientRequestId.current) clientRequestId.current = randomUUID();
    input.clientRequestId = clientRequestId.current;
    await run(async () => {
      // Keep the first payload for this ID, including after an edited retry conflicts.
      if (!submittedDraft.current) submittedDraft.current = { ...input, photos: photos.map(photo => ({ ...photo })) };
      const receipt = await store.report(input);
      if (!receipt?.reportId) throw new Error('접수 결과를 확인하지 못했어요. 다시 확인해 주세요.');
      if (alive.current) { clearDraft(); setScreen('complete'); }
    });
  }
  async function addPhotos() {
    await run(async () => {
      const selected = await evidencePicker(MAX_PHOTOS - photos.length);
      if (!alive.current) return;
      const next = [...photos, ...selected];
      // Picker injection and platform responses are validated again at the form boundary.
      const validation = validateReport({ reason: 'OTHER', description: '증빙', photos: next });
      if (validation) throw new Error(validation);
      setPhotos(next);
    });
  }
  const title = zoom ? '증빙 사진' : ({ participants: '참여자', blocks: '차단한 사용자', report: '신고하기', complete: '신고 접수', warning: '공유 다이어리 안내' }[screen]);
  const hasBlockData = !unavailable && state.status === 'ready';
  function participant(member) {
    const own = member.id === selfId;
    return <View key={member.id} style={s.card}>
      <View style={s.row}><View style={s.grow}><Person member={member}>
        <Text style={s.muted}>{own ? '나 · ' : ''}{member.participation === 'PAST' ? '참여 종료' : member.role === 'OWNER' ? '소유자' : '편집자'}</Text>
        {blocked(member.id) && <Text style={s.badge}>차단됨</Text>}
      </Person></View>
      {!own && <Pressable style={s.icon} accessibilityRole="button" accessibilityLabel={`${member.nickname} 메뉴`} accessibilityState={{ expanded: menu === member.id }} disabled={busy}
        onPress={() => setMenu(menu === member.id ? null : member.id)}><AppIcon name="more" size={22} color={colors.text} /></Pressable>}</View>
      {!own && menu === member.id && <View style={s.menu}>
        <SafetyButton secondary onPress={() => startReport(member)} disabled={busy}>신고하기</SafetyButton>
        {member.activeAccount !== false && <SafetyButton secondary onPress={() => askBlock(member)} disabled={busy || !hasBlockData}>{blocked(member.id) ? '차단 해제' : '차단하기'}</SafetyButton>}
      </View>}
    </View>;
  }
  return <EditorModal visible transparent animationType="none" onRequestClose={back}>
    <SafeAreaView style={[s.backdrop, isPhone && s.phoneBackdrop]}>
      <View style={[s.panel, isPhone && s.phonePanel]}>
        <View style={[s.header, isPhone && s.phoneHeader]}>
          <BackButton label="이전 화면" onPress={back} disabled={busy} />
          <Text accessibilityRole="header" style={s.title}>{title}</Text>
          {screen === 'participants' && <Pressable
            style={s.icon}
            accessibilityRole="button"
            accessibilityLabel="참여자 창 닫기"
            onPress={onClose}
            disabled={busy}
          ><EditorIcon name="close" size={20} /></Pressable>}
        </View>
        <KeyboardAvoidingView style={[s.keyboard, isPhone && s.phoneKeyboard]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
            {preview && <View style={s.notice}><Text style={s.muted}>화면 미리보기 · 실제 신고나 차단은 처리되지 않아요.</Text></View>}
            {unavailable && !zoom && <View style={s.notice}><Text style={s.muted}>{UNAVAILABLE}</Text></View>}
            {!!toast && <View style={s.toast}><Text accessibilityLiveRegion="polite" style={s.text}>{toast}</Text></View>}
            {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
            {zoom ? <>
              <Image source={{ uri: zoom.uri }} resizeMode="contain" style={s.preview} accessibilityLabel="첨부한 증빙 사진 원본" />
              <SafetyButton secondary onPress={() => setZoom(null)}>사진 닫기</SafetyButton>
            </> : <>
              {screen === 'participants' && <>
                <Text style={s.heading}>{request.diary.title}</Text>
                {loading && <ActivityIndicator accessibilityLabel="참여자 불러오는 중" color={colors.primaryStrong} />}
                {!!memberError && <View style={s.notice}><Text style={s.muted}>{memberError}</Text>{!unavailable && <SafetyButton secondary onPress={load}>참여자 다시 불러오기</SafetyButton>}</View>}
                {!unavailable && state.status === 'error' && <><Text style={s.error}>{state.error}</Text><SafetyButton secondary onPress={() => store.refresh()}>차단 상태 다시 불러오기</SafetyButton></>}
                <View style={s.section}>
                  <Text accessibilityRole="header" style={s.heading}>현재 참여 중 · {rows.filter(row => row.participation === 'CURRENT').length}명</Text>
                  {rows.filter(row => row.participation === 'CURRENT').map(participant)}
                  {!loading && !memberError && !rows.length && <Text style={s.muted}>현재 참여자가 없어요</Text>}
                </View>
              </>}
              {screen === 'blocks' && <>
                {state.status === 'loading' && <ActivityIndicator accessibilityLabel="차단 목록 불러오는 중" color={colors.primaryStrong} />}
                {state.status === 'error' && <><Text style={s.error}>{state.error}</Text><SafetyButton secondary onPress={() => store.refresh()}>목록 다시 불러오기</SafetyButton></>}
                {state.status === 'ready' && <Text style={s.heading}>전체 {state.blocks.length}명</Text>}
                {state.status === 'ready' && !state.blocks.length && <View style={s.card}><Text style={s.heading}>차단한 사용자가 없어요</Text></View>}
                {state.blocks.map(member => <View key={member.id} style={s.card}><Person member={member}><Text style={s.muted}>{new Date(member.blockedAt).toLocaleDateString('ko-KR')} 차단</Text></Person>
                  <SafetyButton secondary disabled={busy || !hasBlockData} onPress={() => askBlock(member)}>차단 해제</SafetyButton></View>)}
              </>}
              {screen === 'report' && <>
                {submittedDraft.current && <View style={s.notice}>
                  <Text style={s.muted}>전송한 내용을 수정했다면 처음 전송한 내용으로 되돌린 뒤 같은 요청으로 다시 접수할 수 있어요.</Text>
                  <SafetyButton secondary disabled={busy} onPress={restoreSubmittedDraft}>처음 전송한 내용으로 되돌리기</SafetyButton>
                </View>}
                <View style={s.section}><Text style={s.heading}>신고 대상</Text><View style={s.card}><Person member={target} /></View></View>
                <View style={s.card}><Text style={s.muted}>관련 다이어리</Text><Text style={s.text}>{request.diary.title}</Text><Text style={s.muted}>내 계정으로 접수돼요 · {user.nickname || '나'}</Text></View>
                <View style={s.section}><Text style={s.heading}>신고 사유 · 필수</Text>
                  {REPORT_REASONS.map(([id, label]) => <Pressable key={id} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: reason === id, disabled: busy }} disabled={busy}
                    style={[s.reason, reason === id && s.selected]} onPress={() => setReason(id)}><EditorIcon name={reason === id ? 'radioOn' : 'radioOff'} size={20} color={reason === id ? colors.primaryStrong : colors.textMuted} /><Text style={[s.text, s.grow]}>{label}</Text></Pressable>)}
                </View>
                <View style={s.section}><Text style={s.heading}>상세 설명 · {reason === 'OTHER' ? '필수' : '선택'}</Text>
                  <TextInput accessibilityLabel="상세 설명" placeholder="어떤 일이 있었는지 구체적으로 적어 주세요." placeholderTextColor={colors.textMuted}
                    multiline maxLength={MAX_DESCRIPTION} value={description} onChangeText={setDescription} editable={!busy} style={s.input} />
                  <Text style={s.muted}>{description.length.toLocaleString()} / 1,000자</Text>
                </View>
                <View style={s.section}><Text style={s.heading}>증빙 사진 · 선택</Text><Text style={s.muted}>신고 내용을 확인할 수 있는 사진을 첨부해 주세요. PNG/JPEG · 최대 3장 · 장당 5MiB</Text>
                  <View style={s.photos}>{photos.map((photo, index) => <View key={`${photo.uri}:${index}`} style={s.section}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`증빙 사진 ${index + 1} 확대`} disabled={busy} onPress={() => setZoom(photo)}><Image source={{ uri: photo.uri }} resizeMode="contain" style={s.photo} /></Pressable>
                    <SafetyButton secondary label={`증빙 사진 ${index + 1} 삭제`} disabled={busy} onPress={() => setPhotos(current => current.filter((_, i) => i !== index))}>삭제</SafetyButton>
                  </View>)}</View>
                  <SafetyButton secondary disabled={busy || photos.length >= MAX_PHOTOS} onPress={addPhotos}>사진 첨부 ({photos.length}/3)</SafetyButton>
                </View>
                <Text style={s.muted}>신고는 운영자가 검토한 뒤 처리해요. 신고만으로 상대방이 자동 차단되지는 않아요.</Text>
              </>}
              {screen === 'complete' && <View style={s.card}><Text style={s.title}>{preview ? '신고 화면 확인을 마쳤어요' : '신고가 접수되었어요'}</Text>
                <Text style={s.text}>{preview ? '실제로 접수되지 않은 미리보기 결과예요.' : '보내주신 내용을 확인한 뒤 필요한 조치를 진행할게요.'}</Text></View>}
              {screen === 'warning' && <>
                <Text style={s.heading}>차단한 사용자가 함께하고 있어요</Text>
                <Text style={s.text}>이 다이어리에는 내가 차단한 사용자 {request.rows.length}명이 참여 중이에요.{"\n"}해당 사용자도 이 다이어리를 보고 편집할 수 있어요.</Text>
                <Pressable accessibilityRole="checkbox" accessibilityLabel="이 다이어리에서 다시 보지 않기" accessibilityState={{ checked: dismiss, disabled: busy }} disabled={busy} style={s.reason} onPress={() => setDismiss(value => !value)}>
                  <EditorIcon name={dismiss ? 'checkboxOn' : 'checkboxOff'} size={20} color={dismiss ? colors.primaryStrong : colors.textMuted} /><Text style={s.text}>이 다이어리에서 다시 보지 않기</Text>
                </Pressable>
              </>}
            </>}
          </ScrollView>
          {!zoom && screen === 'report' && <View style={s.footer}><SafetyButton disabled={busy || unavailable || Boolean(validateReport({ reason, description, photos }))} onPress={submit}>
            {busy ? '처리 중…' : preview ? '신고 화면 확인하기' : '신고 접수하기'}</SafetyButton></View>}
          {!zoom && screen === 'complete' && <View style={s.footer}><SafetyButton disabled={busy} onPress={back}>확인</SafetyButton>
            {target.activeAccount !== false && !blocked(target.id) && <SafetyButton secondary disabled={busy || !hasBlockData} onPress={() => askBlock(target)}>이 사용자 차단하기</SafetyButton>}</View>}
          {screen === 'warning' && <View style={s.footer}><SafetyButton disabled={busy} onPress={() => run(() => onWarning(true, dismiss, request.rows, request.diary))}>계속하기</SafetyButton><SafetyButton secondary disabled={busy} onPress={back}>돌아가기</SafetyButton></View>}
        </KeyboardAvoidingView>
      </View>
      <ConfirmDialog open={Boolean(question)} danger={false}
        title={question?.kind === 'discard' ? '작성 중인 신고를 닫을까요?' : question?.kind === 'unblock' ? `${question.member.nickname}님의 차단을 해제할까요?` : `${question?.member?.nickname}님을 차단할까요?`}
        message={question?.kind === 'discard' ? '작성한 내용과 첨부한 사진이 사라져요.' : question?.kind === 'unblock' ? '서로 이메일 초대를 주고받거나 수락할 수 있게 돼요. 유효한 대기 초대도 다시 수락할 수 있어요.' : blockMessage}
        confirmLabel={question?.kind === 'discard' ? '작성 취소' : question?.kind === 'unblock' ? '차단 해제' : '차단하기'} onCancel={() => setQuestion(null)} onConfirm={confirm} />
    </SafeAreaView>
  </EditorModal>;
}
