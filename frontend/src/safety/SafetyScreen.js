import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import EditorModal from '../editor/components/controls/EditorModal';
import EditorIcon from '../editor/components/controls/Icon';
import ConfirmDialog from '../editor/components/controls/ConfirmDialog';
import AppIcon from '../shared/AppIcon';
import BackButton from '../diary/components/BackButton';
import EmptyState from '../diary/components/EmptyState';
import MemberAvatar from '../sharing/MemberAvatar';
import { useFormFactor } from '../shared/useFormFactor';
import { colors } from '../shared/theme';
import { pickEvidence } from './evidencePicker';
import { MAX_DESCRIPTION, MAX_PHOTOS, REPORT_REASONS, UNAVAILABLE, normalizeParticipants, validateReport } from './safetyModel';
import { safetyStyles as s } from './styles';
import { randomUUID } from 'expo-crypto';

export function SafetyButton({ children, label = children, onPress, secondary, disabled, style }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={Array.isArray(label) ? label.join('') : label} accessibilityState={{ disabled: Boolean(disabled) }}
    disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, disabled && s.disabled, style]}>
    <Text style={[s.buttonText, secondary && s.secondaryText]}>{children}</Text>
  </Pressable>;
}

// 동그라미 얼굴(참여자 시트와 같은 모양). 기본 40, 신고 작성 머리줄 32 · 안내 칩 20
export function Face({ member, size = 40 }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
    <MemberAvatar member={member} />
  </View>;
}
export function Person({ member, children }) {
  return <View style={s.row}>
    <Face member={member} />
    <View style={s.grow}><Text style={s.name}>{member.nickname || '사용자'}</Text>{children}</View>
  </View>;
}
// 차단 확인창 본문: 짧은 항목 세 줄. 차단은 user_blocks 에 한 줄만 저장하고 상대에게 알림 · 메일 · 표시가 없다(백엔드 BlockService 확인, 2026-11-09)
const blockMessage = '· 상대에게 알리지 않아요\n· 서로 이메일 초대를 보내거나 받을 수 없어요\n· 함께 쓰던 다이어리는 그대로예요';
// 역할을 모르는 대상(role · participation 이 없이 넘어온 신고 대상)은 역할을 쓰지 않는다 — 소유자를 '편집자'로 잘못 보이지 않게(리뷰 !489)
const roleLabel = member => member.participation === 'PAST' ? '참여 종료' : member.role === 'OWNER' ? '소유자' : member.role ? '편집자' : '';

export default function SafetyScreen({ request, user, store, state, onClose, onWarning, evidencePicker = pickEvidence }) {
  const { isPhone } = useFormFactor();
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState(request.kind);
  const [rows, setRows] = useState(() => normalizeParticipants(request.diary?.members));
  const [loading, setLoading] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [target, setTarget] = useState(request.target || null);
  const [menu, setMenu] = useState(request.target?.id || null);
  // 신고는 두 단계: 사유 고르기(reason) → 작성(write). 2026-11-09 지라 537 A안(설문처럼 동그라미 + 다음)
  const [step, setStep] = useState('reason');
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
  const diaryTitle = request.diary?.title || '';
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
    // 앱 토스트와 같은 2초(디자인 가이드 토스트 · 진행 알약)
    const timer = setTimeout(() => setToast(''), 2000);
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
    // 작성 단계의 ‹ 는 사유 고르기로 한 단계만 돌아간다(쓰던 내용은 그대로)
    if (screen === 'report' && step === 'write') { setStep('reason'); setError(''); return; }
    if (screen === 'report' && dirty) { setQuestion({ kind: 'discard' }); return; }
    if (screen === 'report' || screen === 'complete') { clearDraft(); if (request.direct) { onClose(); return; } setScreen('participants'); return; }
    onClose();
  }
  // 신고 대상을 바꿀 때(startReport)도 이 함수를 거친다
  function clearDraft() { clientRequestId.current = null; submittedDraft.current = null; setReason(''); setDescription(''); setPhotos([]); setError(''); setStep('reason'); }
  function restoreSubmittedDraft() {
    const draft = submittedDraft.current;
    if (!draft || busy) return;
    setReason(draft.reason); setDescription(draft.description); setPhotos(draft.photos.map(photo => ({ ...photo }))); setError('');
  }
  function startReport(member) { clearDraft(); setTarget(member); setMenu(null); setScreen('report'); }
  function askBlock(member) { setTarget(member); setError(''); setQuestion({ kind: blocked(member.id) ? 'unblock' : 'block', member }); }
  // 머리줄 X(태블릿): 창 전체를 닫는다(공유 창과 같은 ‹ · X 통일, 2026-11-08). 쓰던 신고가 있으면 버릴지 묻고, 공유 다이어리 안내는 ‹ 와 같게 '들어가지 않음'
  function closeAll() {
    if (locked.current || state.busy) return;
    if (screen === 'warning') { back(); return; }
    if (screen === 'report' && dirty) { setQuestion({ kind: 'discard', closeAll: true }); return; }
    clearDraft(); onClose();
  }
  function confirm() {
    const current = question;
    setQuestion(null);
    if (current.kind === 'submit') return submit();
    if (current.kind === 'discard') { clearDraft(); if (request.direct || current.closeAll) { onClose(); return; } setScreen('participants'); return; }
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
      // 차단은 신고와 섞지 않는다: 접수 화면에서 '○○님 차단하기'로 따로 묻는다(2026-11-09 지라 537, 인스타그램 · 디스코드 관례)
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
  const reasonLabel = REPORT_REASONS.find(([id]) => id === reason)?.[1] || '';
  const title = zoom ? '증빙 사진' : ({ participants: '참여자', blocks: '차단한 사용자', report: '신고하기', complete: '신고 접수', warning: '공유 다이어리 안내' }[screen]);
  const hasBlockData = !unavailable && state.status === 'ready';
  const canBlockTarget = target && target.activeAccount !== false && !blocked(target.id) && hasBlockData;
  function participant(member) {
    const own = member.id === selfId;
    return <View key={member.id} style={s.listRow}>
      <View style={s.row}><View style={s.grow}><Person member={member}>
        <Text style={s.muted}>{[own && '나', roleLabel(member)].filter(Boolean).join(' · ')}</Text>
        {blocked(member.id) && <Text style={s.badge}>차단됨</Text>}
      </Person></View>
      {!own && <Pressable style={s.icon} accessibilityRole="button" accessibilityLabel={`${member.nickname} 메뉴`} accessibilityState={{ expanded: menu === member.id }} disabled={busy}
        onPress={() => setMenu(menu === member.id ? null : member.id)}><AppIcon name="more" size={22} color={colors.text} /></Pressable>}</View>
      {!own && menu === member.id && <View style={s.menu}>
        <SafetyButton secondary onPress={() => startReport(member)} disabled={busy} style={s.grow}>신고하기</SafetyButton>
        {member.activeAccount !== false && <SafetyButton secondary onPress={() => askBlock(member)} disabled={busy || !hasBlockData} style={s.grow}>{blocked(member.id) ? '차단 해제' : '차단하기'}</SafetyButton>}
      </View>}
    </View>;
  }

  // 차단한 사용자 참여 안내: 전체 화면 대신 가운데 모달(2026-11-09 지라 537 3판). 돌아가기 · 계속하기 한 줄, '다시 보지 않기'는 맨 아래 작은 체크
  if (screen === 'warning') {
    return <EditorModal visible transparent animationType="none" onRequestClose={back}>
      <View style={s.dialogBackdrop}>
        <View style={s.dialog} accessibilityRole="alert">
          <View style={s.dialogIcon}><EditorIcon name="people" size={28} color={colors.primaryStrong} /></View>
          <Text accessibilityRole="header" style={s.dialogTitle}>차단한 사용자가 함께하고 있어요</Text>
          <View style={s.chips}>{request.rows.map(member => <View key={member.id} style={s.chip}><Face member={member} size={20} /><Text style={s.chipText}>{member.nickname || '사용자'}</Text></View>)}</View>
          {!!error && <Text accessibilityRole="alert" style={[s.error, s.center]}>{error}</Text>}
          <View style={s.dialogActions}>
            <SafetyButton secondary disabled={busy} onPress={back} style={s.grow}>돌아가기</SafetyButton>
            <SafetyButton disabled={busy} onPress={() => run(() => onWarning(true, dismiss, request.rows, request.diary))} style={s.grow}>계속하기</SafetyButton>
          </View>
          <Pressable accessibilityRole="checkbox" accessibilityLabel="이 다이어리에서 다시 보지 않기" accessibilityState={{ checked: dismiss, disabled: busy }} disabled={busy}
            style={s.dismiss} onPress={() => setDismiss(value => !value)}>
            <EditorIcon name={dismiss ? 'checkboxOn' : 'checkboxOff'} size={18} color={dismiss ? colors.primaryStrong : colors.textMuted} />
            <Text style={s.dismissText}>이 다이어리에서 다시 보지 않기</Text>
          </Pressable>
        </View>
      </View>
    </EditorModal>;
  }

  const fixedPanel = !isPhone && (screen === 'report' || screen === 'complete');
  const footer = zoom ? null
    : screen === 'report' && step === 'reason' ? <SafetyButton disabled={busy || !reason} onPress={() => { setError(''); setStep('write'); }}>다음</SafetyButton>
      : screen === 'report' ? <SafetyButton disabled={busy || unavailable || Boolean(validateReport({ reason, description, photos }))} onPress={() => setQuestion({ kind: 'submit' })}>
        {busy ? '처리 중…' : preview ? '신고 화면 확인하기' : '신고 접수하기'}</SafetyButton>
        : screen === 'complete' ? <SafetyButton disabled={busy} onPress={back}>확인</SafetyButton> : null;

  return <EditorModal visible transparent animationType="none" onRequestClose={back}>
    {/* 폰: 위 안전 영역은 머리줄과 같은 연보라, 아래 안전 영역은 흰 본문 · 아래 버튼 줄과 같은 흰색(2026-11-09 지라 537) */}
    <SafeAreaView edges={isPhone ? ['top', 'left', 'right'] : undefined} style={[s.backdrop, isPhone && s.phoneBackdrop]}>
      {/* 태블릿: 신고 단계 동안 창 높이를 고정해 사유 → 작성 → 접수로 넘어갈 때 창이 줄었다 늘었다 하지 않게 한다 */}
      <View style={[s.panel, fixedPanel && s.panelFixed, isPhone && s.phonePanel, isPhone && { paddingBottom: insets.bottom }]}>
        <View style={[s.header, isPhone && s.phoneHeader]}>
          <BackButton label="이전 화면" onPress={back} disabled={busy} />
          <Text accessibilityRole="header" style={s.title}>{title}</Text>
          {/* X 는 태블릿(가운데 창)만 — 폰은 전체 화면이라 ‹ 와 같은 일을 하는 X 가 겹친다(다른 폰 전체 화면도 ‹ 만) */}
          {!isPhone && <Pressable accessibilityRole="button" accessibilityLabel="창 닫기" disabled={busy} onPress={closeAll} style={s.closeButton}>
            <EditorIcon name="close" size={20} color={colors.text} />
          </Pressable>}
        </View>
        {/* 높이를 고정한 태블릿 창도 가운데가 남은 높이를 채워야 '확인' 줄이 창 아래에 붙는다(접수 화면처럼 내용이 짧을 때 가운데에 떠 있었다) */}
        <KeyboardAvoidingView style={[s.keyboard, (isPhone || fixedPanel) && s.phoneKeyboard]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={[s.body, screen === 'complete' && !zoom && s.bodyCentered]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
            {preview && <View style={s.notice}><Text style={s.muted}>화면 미리보기 · 실제 신고나 차단은 처리되지 않아요.</Text></View>}
            {unavailable && !zoom && <View style={s.notice}><Text style={s.muted}>{UNAVAILABLE}</Text></View>}
            {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
            {zoom ? <>
              <Image source={{ uri: zoom.uri }} resizeMode="contain" style={s.preview} accessibilityLabel="첨부한 증빙 사진 원본" />
              <SafetyButton secondary onPress={() => setZoom(null)}>사진 닫기</SafetyButton>
            </> : <>
              {screen === 'participants' && <>
                <Text style={s.sectionTitle}>{diaryTitle}</Text>
                {loading && <ActivityIndicator accessibilityLabel="참여자 불러오는 중" color={colors.primaryStrong} />}
                {!!memberError && <View style={s.notice}><Text style={s.muted}>{memberError}</Text>{!unavailable && <SafetyButton secondary onPress={load}>참여자 다시 불러오기</SafetyButton>}</View>}
                {!unavailable && state.status === 'error' && <><Text style={s.error}>{state.error}</Text><SafetyButton secondary onPress={() => store.refresh()}>차단 상태 다시 불러오기</SafetyButton></>}
                <Text accessibilityRole="header" style={s.sectionTitle}>현재 참여 중 · {rows.filter(row => row.participation === 'CURRENT').length}명</Text>
                <View>{rows.filter(row => row.participation === 'CURRENT').map(participant)}</View>
                {!loading && !memberError && !rows.length && <Text style={s.muted}>현재 참여자가 없어요</Text>}
              </>}
              {screen === 'blocks' && <>
                {state.status === 'loading' && <ActivityIndicator accessibilityLabel="차단 목록 불러오는 중" color={colors.primaryStrong} />}
                {state.status === 'error' && <><Text style={s.error}>{state.error}</Text><SafetyButton secondary onPress={() => store.refresh()}>목록 다시 불러오기</SafetyButton></>}
                {state.status === 'ready' && !!state.blocks.length && <Text accessibilityRole="header" style={s.sectionTitle}>전체 {state.blocks.length}명</Text>}
                {state.status === 'ready' && !state.blocks.length && <EmptyState small title="차단한 사용자가 없어요" />}
                {/* 차단 목록: 카드 없이 설정 줄처럼(줄 64 · 아래 구분선), 해제는 문의 이메일 '복사'와 같은 옅은 버튼(2026-11-09 지라 537) */}
                <View>{state.blocks.map(member => <View key={member.id} style={[s.listRow, s.row]}>
                  <View style={s.grow}><Person member={member}><Text style={s.muted}>{new Date(member.blockedAt).toLocaleDateString('ko-KR')} 차단</Text></Person></View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${member.nickname} 차단 해제`} accessibilityState={{ disabled: busy || !hasBlockData }} disabled={busy || !hasBlockData}
                    onPress={() => askBlock(member)} style={[s.tonal, (busy || !hasBlockData) && s.disabled]}><Text style={s.tonalText}>차단 해제</Text></Pressable>
                </View>)}</View>
              </>}
              {screen === 'report' && step === 'reason' && <>
                {/* 신고 대상: 공유 창 참여자 줄과 같은 얼굴 40 줄 */}
                <View style={[s.listRow, s.row]}><Face member={target} /><View style={s.grow}>
                  <Text style={s.name}>{target.nickname || '사용자'}</Text>
                  <Text style={s.muted}>{[roleLabel(target), diaryTitle].filter(Boolean).join(' · ')}</Text>
                </View></View>
                <Text accessibilityRole="header" style={s.sectionTitle}>신고 사유</Text>
                {/* 설문처럼 왼쪽 동그라미, 줄 48 · 아래 구분선. 고른 줄은 동그라미 · 글자만 보라(면 · 테두리 없음) */}
                <View accessibilityRole="radiogroup">{REPORT_REASONS.map(([id, label]) => <Pressable key={id} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: reason === id, disabled: busy }} disabled={busy}
                  style={s.option} onPress={() => setReason(id)}>
                  <View style={[s.radio, reason === id && s.radioOn]}>{reason === id && <View style={s.radioDot} />}</View>
                  <Text style={[s.optionText, reason === id && s.optionTextOn]}>{label}</Text>
                </Pressable>)}</View>
              </>}
              {screen === 'report' && step === 'write' && <>
                {submittedDraft.current && <View style={s.notice}>
                  <Text style={s.muted}>전송한 내용을 수정했다면 처음 전송한 내용으로 되돌린 뒤 같은 요청으로 다시 접수할 수 있어요.</Text>
                  <SafetyButton secondary disabled={busy} onPress={restoreSubmittedDraft}>처음 전송한 내용으로 되돌리기</SafetyButton>
                </View>}
                <View style={[s.listRow, s.row, s.targetHead]}><Face member={target} size={32} /><View style={s.grow}>
                  <Text style={[s.name, s.strong]}>{target.nickname || '사용자'}</Text>
                  <Text style={s.muted}>{['신고 대상', diaryTitle].filter(Boolean).join(' · ')}</Text>
                </View></View>
                <Pressable accessibilityRole="button" accessibilityLabel={`신고 사유 ${reasonLabel} 바꾸기`} disabled={busy} onPress={() => setStep('reason')} style={[s.listRow, s.row, s.settingRow]}>
                  <Text style={[s.name, s.grow]}>신고 사유</Text>
                  <Text style={s.value}>{reasonLabel}</Text>
                  <AppIcon name="chevron-right" size={18} forText={16} color={colors.textMuted} />
                </Pressable>
                <View style={s.fieldHead}><Text style={s.fieldLabel}>상세 설명 · {reason === 'OTHER' ? '필수' : '선택'}</Text><Text style={s.muted}>{description.length.toLocaleString()} / 1,000자</Text></View>
                <TextInput accessibilityLabel="상세 설명"
                  multiline maxLength={MAX_DESCRIPTION} value={description} onChangeText={setDescription} editable={!busy} style={s.input} />
                <View style={s.fieldHead}><Text style={s.fieldLabel}>증빙 사진 · 선택</Text><Text style={s.muted}>최대 3장 · 장당 5MB</Text></View>
                <View style={s.photos}>
                  {photos.map((photo, index) => <View key={`${photo.uri}:${index}`} style={s.photoCell}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`증빙 사진 ${index + 1} 확대`} disabled={busy} onPress={() => setZoom(photo)}><Image source={{ uri: photo.uri }} resizeMode="cover" style={s.photo} /></Pressable>
                    {/* 칸마다 오른쪽 위 X(그림 24, 누르는 칸 40) — 예전엔 사진 아래 전폭 '삭제' 버튼이었다 */}
                    <Pressable accessibilityRole="button" accessibilityLabel={`증빙 사진 ${index + 1} 삭제`} disabled={busy} hitSlop={8}
                      onPress={() => setPhotos(current => current.filter((_, i) => i !== index))} style={s.photoDelete}>
                      <View style={s.photoDeleteDot}><EditorIcon name="close" size={14} color={colors.surface} /></View>
                    </Pressable>
                  </View>)}
                  {photos.length < MAX_PHOTOS && <Pressable accessibilityRole="button" accessibilityLabel={`사진 첨부 (${photos.length}/3)`} disabled={busy} onPress={addPhotos} style={[s.photoAdd, busy && s.disabled]}>
                    <EditorIcon name="plus" size={24} color={colors.primaryStrong} />
                  </Pressable>}
                </View>
              </>}
              {screen === 'complete' && <View style={s.complete}>
                <View style={s.dialogIcon}><EditorIcon name="saved" size={32} color={colors.primaryStrong} /></View>
                <Text accessibilityRole="header" style={s.completeTitle}>{preview ? '신고 화면 확인을 마쳤어요' : '신고가 접수되었어요'}</Text>
                {canBlockTarget && <Pressable accessibilityRole="button" accessibilityLabel={`${target.nickname}님 차단하기`} disabled={busy} onPress={() => askBlock(target)} style={[s.blockOffer, busy && s.disabled]}>
                  <EditorIcon name="ban" size={18} color={colors.dangerStrong} />
                  <Text style={s.blockOfferText}>{target.nickname}님 차단하기</Text>
                </Pressable>}
              </View>}
            </>}
          </ScrollView>
          {footer && <View style={s.footer}>{footer}</View>}
        </KeyboardAvoidingView>
        {/* 완료 토스트: 앱 공통 알약(아래 · 진한 바탕 · 흰 글자 13/700) */}
        {!!toast && <View pointerEvents="none" style={[s.toast, { bottom: (footer ? 88 : 24) + (isPhone ? insets.bottom : 0) }]}><Text accessibilityLiveRegion="polite" style={s.toastText}>{toast}</Text></View>}
      </View>
      <ConfirmDialog open={Boolean(question)} danger={question?.kind === 'block'}
        title={question?.kind === 'submit' ? `${target?.nickname || '사용자'}님을 신고할까요?` : question?.kind === 'discard' ? '작성 중인 신고를 닫을까요?' : question?.kind === 'unblock' ? `${question.member.nickname}님의 차단을 해제할까요?` : `${question?.member?.nickname}님을 차단할까요?`}
        message={question?.kind === 'submit' ? '' : question?.kind === 'discard' ? '작성한 내용과 첨부한 사진이 사라져요.' : question?.kind === 'unblock' ? '서로 이메일 초대를 주고받거나 수락할 수 있게 돼요. 유효한 대기 초대도 다시 수락할 수 있어요.' : blockMessage}
        confirmLabel={question?.kind === 'submit' ? '접수하기' : question?.kind === 'discard' ? '작성 취소' : question?.kind === 'unblock' ? '차단 해제' : '차단하기'} onCancel={() => setQuestion(null)} onConfirm={confirm} />
    </SafeAreaView>
  </EditorModal>;
}
