import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import EditorModal from '../editor/components/controls/EditorModal';
import SharingHub from '../sharing/SharingHub';
import AuthenticatedNotificationDialog from './AuthenticatedNotificationDialog';

// 목록→공유 상세에서 네이티브 Modal을 교체하지 않는다.
export default function HomeNotificationFlow({ request, model, sharing, onRequest, onClose, onOpenCopy, onOpenDiary }) {
  const sharingBack = useRef(null);
  const onBackReady = useCallback(handler => { sharingBack.current = handler; }, []);
  const inSharing = request.mode !== 'notifications';
  useEffect(() => { if (!inSharing) model.store.refreshNotifications(); }, [inSharing, model.store]);
  const returnToList = () => { model.store.closeInvitation(); onRequest({ mode: 'notifications' }); };
  const back = () => {
    if (inSharing) {
      if (sharingBack.current) sharingBack.current();
      else returnToList();
    }
    else if (model.invitation.status !== 'idle') model.store.closeInvitation();
    else onClose();
  };
  return <EditorModal visible transparent animationType="none" onRequestClose={back}>
    <View testID="home-notification-modal-content" style={{ flex: 1 }}>{inSharing
      ? <SharingHub embedded onBackReady={onBackReady} request={request} runtime={sharing.runtime} model={sharing.notifications} onReturnToNotifications={returnToList} onClose={onClose} onOpenCopy={onOpenCopy} onOpenDiary={onOpenDiary} />
      : <AuthenticatedNotificationDialog embedded model={model} onClose={onClose} onInvitationReady={value => onRequest({ mode: 'invitation', inviteId: value.inviteId, returnToNotifications: true })} />}</View>
  </EditorModal>;
}
