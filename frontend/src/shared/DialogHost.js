import { useEffect, useSyncExternalStore } from 'react';
import ConfirmDialog from '../editor/components/controls/ConfirmDialog';
import { dialogStore } from './dialogs';

// 앱 맨 위에 한 번 둔다. confirmAction · notify 요청을 앱 테마의 ConfirmDialog 로 보여 준다(휴지통 · 영구 삭제 · 로그아웃 확인 등).
export default function DialogHost() {
  useEffect(() => dialogStore.attach(), []);
  const request = useSyncExternalStore(dialogStore.subscribe, dialogStore.getSnapshot, dialogStore.getSnapshot);
  return (
    <ConfirmDialog
      open={Boolean(request)}
      title={request?.title}
      message={request?.message}
      confirmLabel={request?.kind === 'notify' ? '확인' : request?.confirmLabel}
      cancelLabel={request?.cancelLabel}
      danger={request?.kind === 'confirm' && request.danger}
      showCancel={request?.kind !== 'notify'}
      onConfirm={() => dialogStore.settle(true)}
      onCancel={() => dialogStore.settle(false)}
    />
  );
}
