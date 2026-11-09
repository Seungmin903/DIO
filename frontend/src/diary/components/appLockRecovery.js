import { clearAppLock, readAppLockState } from '../../shared/appLock';
import { confirmAction, notify } from '../../shared/dialogs';

const FAILED = '앱 잠금을 초기화하지 못했어요. 잠시 후 다시 시도해 주세요.';
const STILL_UNREADABLE = '앱 잠금 정보를 아직 읽지 못했어요. 기기 잠금을 푼 뒤 잠시 후 다시 시도해 주세요.';

/**
 * PIN 화면 '잊었어요' 칸에 둘 동작. 없으면 undefined(칸을 비운다).
 * - 회원: 앱 잠금 4자리는 계정에 묶인 정보(이 기기 · 이 계정)라 계정으로 다시 확인한다(onReauth → AppLockReauth, 지라 799).
 *   통과하면 새 4자리를 정하거나 잠금을 끈다. 로그아웃 없이 이어서 쓴다.
 * - 게스트: 앱 잠금을 쓸 수 없다(지라 799). 예전에 켜 둔 잠금은 맞는 4자리로 한 번 열면 꺼진다. 정상 잠금은 PIN 없이 풀지 않는다.
 *   - corrupt(저장값 손상): 다시 읽어도 PIN을 확인할 수 없으므로 잠금 초기화를 연다(일기는 지우지 않는다).
 *   - storage(보안 저장소 읽기 오류): 재부팅·기기 잠금 직후처럼 잠시 읽히지 않는 경우가 있어, PIN 없이 풀리지 않게
 *     초기화는 열지 않고 다시 읽기만 한다. 다시 읽은 상태는 onStateChange 로 알린다.
 * state: readAppLockState 결과. onReauth: 회원 계정 다시 확인 화면을 연다. onCleared: 게스트 초기화가 끝난 뒤.
 */
export function appLockRecoveryAction({ member, state, scope, onReauth, onCleared, onStateChange }) {
  if (member) return typeof onReauth === 'function' ? onReauth : undefined;
  if (state === 'storage') {
    return async () => {
      const next = await readAppLockState(scope).catch(() => 'storage');
      onStateChange?.(next);
      if (next === 'storage') notify('앱 잠금', STILL_UNREADABLE);
    };
  }
  if (state !== 'corrupt') return undefined;
  return () => confirmAction({
    title: '앱 잠금을 초기화할까요?', message: '저장된 앱 잠금 정보가 손상돼 비밀번호를 확인할 수 없어요. 초기화하면 이 기기에서 PIN 없이 앱을 열 수 있고, 일기는 그대로 남아요.', confirmLabel: '초기화',
    onConfirm: async () => {
      try { await clearAppLock(scope); }
      catch { notify('앱 잠금', FAILED); return; }
      onCleared?.();
    },
  });
}
