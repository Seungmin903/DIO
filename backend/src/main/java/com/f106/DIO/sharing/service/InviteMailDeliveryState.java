package com.f106.DIO.sharing.service;
import com.f106.DIO.sharing.repository.DiaryInviteRepository;
import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.user.repository.UserRepository;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
public class InviteMailDeliveryState {
    private final DiaryInviteRepository invites;private final DiaryRepository diaries;private final UserRepository users;
    public InviteMailDeliveryState(DiaryInviteRepository invites,DiaryRepository diaries,UserRepository users){this.invites=invites;this.diaries=diaries;this.users=users;}
    @Transactional(readOnly=true,propagation=Propagation.REQUIRES_NEW)
    public boolean deliverable(long id){
        var invite=invites.findById(id).orElse(null);
        return invite!=null&&invite.pendingEmail()&&diaries.findByDiaryIdAndDeletedAtIsNull(invite.getDiaryId()).isPresent()
            &&users.findById(invite.getInviteeUserId()).filter(u->u.isActive()).isPresent();
    }
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void failed(long id){
        var diaryId=invites.diaryId(id).orElse(null);if(diaryId==null||diaries.findForUpdate(diaryId).isEmpty())return;
        invites.findById(id).ifPresent(i->i.deliveryFailed(Instant.now()));
    }
}
