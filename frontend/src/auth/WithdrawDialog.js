import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Modal from '../editor/components/controls/EditorModal';
import { colors } from '../shared/theme';
import { useProfileKeyboard } from './useProfileKeyboard';
import { profileStyles as s } from './profileStyles';

const WITHDRAW_TEXT = '탈퇴합니다';

/**
 * 회원 탈퇴 확인 창: 마이페이지 계정 구역의 `회원 탈퇴` 줄에서 연다(지라 597).
 * 공용 확인창 틀(오른쪽 위 X 없음, 취소는 글자 버튼, 지라 651). ‘탈퇴합니다’를 정확히 입력해야 탈퇴할 수 있다.
 * 탈퇴는 서버가 모든 세션을 폐기하므로 성공하면 이 기기의 세션만 정리한다(onEndSession).
 */
export default function WithdrawDialog({ user, service, onClose, onEndSession }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true), running = useRef(false);
  const form = useProfileKeyboard();
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const canWithdraw = typeof service?.withdraw === 'function';
  const ready = text === WITHDRAW_TEXT && canWithdraw && !busy;
  const close = () => {
    if (running.current) return;
    form.dismiss();
    onClose?.();
  };
  const withdraw = async () => {
    if (running.current || text !== WITHDRAW_TEXT || !canWithdraw) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await service.withdraw(user);
      onEndSession?.();
    } catch (reason) {
      if (mounted.current) setError(reason?.message || '처리하지 못했어요. 다시 시도해 주세요.');
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
        <ScrollView ref={form.scroll} style={{ width: '100%' }} contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled"
          onLayout={form.reveal} onScroll={form.onScroll} scrollEventThrottle={16}>
          <View style={[s.dialog, s.confirmDialog]} accessibilityViewIsModal>
            <View style={s.dialogHeading}>
              <Text accessibilityRole="header" style={[s.dialogTitle, s.confirmTitle]}>정말 탈퇴하시겠어요?</Text>
            </View>
            <View style={s.dialogBody}>
              <Text style={s.muted}>탈퇴하면 DIO 계정을 더 이상 사용할 수 없어요.{'\n'}탈퇴 전 필요한 기록을 내보내 주세요.</Text>
              <Text style={s.text}>확인을 위해 아래에 ‘탈퇴합니다’를 입력해 주세요.</Text>
              <View style={[s.field, focused && s.focused]}>
                <TextInput
                  ref={inputRef}
                  accessibilityLabel="탈퇴 확인 문구"
                  value={text}
                  onChangeText={value => { setText(value); setError(''); }}
                  editable={!busy}
                  maxLength={30}
                  placeholder="확인 문구를 입력해 주세요"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  onFocus={() => { setFocused(true); form.focus(inputRef.current); }}
                  onBlur={() => { setFocused(false); form.blur(inputRef.current); }}
                  style={s.input}
                />
              </View>
              {text === WITHDRAW_TEXT && <Text style={s.hint}>확인 문구가 일치해요.</Text>}
              {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
            </View>
            <View style={s.confirmActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="취소" disabled={busy} onPress={close} style={s.confirmButton}>
                <Text style={s.confirmCancelText}>취소</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="탈퇴하기"
                accessibilityState={{ disabled: !ready }}
                disabled={!ready}
                onPress={withdraw}
                style={[s.confirmButton, s.confirmDanger, !ready && s.disabled]}
              >
                {busy ? <ActivityIndicator color={colors.surface} /> : <Text style={s.confirmOkText}>탈퇴하기</Text>}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
