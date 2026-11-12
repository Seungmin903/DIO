import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import EditorModal from '../editor/components/controls/EditorModal';
import SharingHub from '../sharing/SharingHub';
import AuthenticatedNotificationDialog from './AuthenticatedNotificationDialog';

// 목록→공유 상세에서 네이티브 Modal을 교체하지 않는다.
export default function HomeNotificationFlow({ visible = true, request, model, sharing, onRequest, onClose, onOpenCopy, onOpenDiary, onOpenParticipants }) {
  const sharingBack = useRef(null);
  const visitedSharing = useRef(false);
  const onBackReady = useCallback(handler => { sharingBack.current = handler; }, []);
  const inSharing = request.mode !== 'notifications';
  useEffect(() => { if (inSharing) visitedSharing.current = true; }, [inSharing]);
  useEffect(() => { if (!inSharing) model.store.refreshNotifications(); }, [inSharing, model.store]);
  const close = () => onClose(inSharing || visitedSharing.current);
  const returnToList = () => { model.store.closeInvitation(); onRequest({ mode: 'notifications' }); };
  const back = () => {
    if (inSharing) {
      if (sharingBack.current) sharingBack.current();
      else returnToList();
    }
    else if (model.invitation.status !== 'idle') model.store.closeInvitation();
    else close();
  };
  if (!visible) return null;
  return <EditorModal visible transparent animationType="none" onRequestClose={back}>
    <View testID="home-notification-modal-content" style={{ flex: 1 }}>{inSharing
      ? <SharingHub onOpenParticipants={onOpenParticipants} embedded onBackReady={onBackReady} request={request} runtime={sharing.runtime} model={sharing.notifications} onReturnToNotifications={returnToList} onClose={close} onOpenCopy={onOpenCopy} onOpenDiary={onOpenDiary} />
      : <AuthenticatedNotificationDialog embedded model={model} onClose={close} onInvitationReady={value => onRequest({ mode: 'invitation', inviteId: value.inviteId, returnToNotifications: true })} />}</View>
  </EditorModal>;
}
