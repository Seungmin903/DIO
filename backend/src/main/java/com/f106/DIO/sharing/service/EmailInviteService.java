package com.f106.DIO.sharing.service;
import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.domain.DiaryMemberId;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.sharing.domain.*;
import com.f106.DIO.sharing.dto.*;
import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.sharing.repository.*;
import com.f106.DIO.sharing.support.InviteTokens;
import com.f106.DIO.user.repository.UserRepository;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class EmailInviteService {
    @org.springframework.beans.factory.annotation.Autowired private com.f106.DIO.inventory.InventoryLimits inventory;
    private final com.f106.DIO.moderation.service.BlockService blocks;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager entities;
    private final SharingAccessService access;private final DiaryInviteRepository invites;private final DiaryMemberRepository members;
    private final UserRepository users;private final InviteTokens tokens;
    private final org.springframework.transaction.support.TransactionTemplate write;
    private final ApplicationEventPublisher events;private final InviteViews views;private final DiaryInviteService links;
    private final com.f106.DIO.sharing.support.EmailInviteAttemptThrottle attempts;
    public EmailInviteService(SharingAccessService access,DiaryInviteRepository invites,DiaryMemberRepository members,UserRepository users,
            InviteTokens tokens,ApplicationEventPublisher events,InviteViews views,DiaryInviteService links,org.springframework.transaction.PlatformTransactionManager manager,com.f106.DIO.sharing.support.EmailInviteAttemptThrottle attempts,com.f106.DIO.moderation.service.BlockService blocks){
        this.write=new org.springframework.transaction.support.TransactionTemplate(manager);
        this.blocks=blocks;this.access=access;this.invites=invites;this.members=members;this.users=users;this.tokens=tokens;this.events=events;this.views=views;this.links=links;this.attempts=attempts;
    }
    @Transactional(propagation=org.springframework.transaction.annotation.Propagation.NEVER)
    public EmailInviteAcknowledgement send(UUID diaryId,long actor,EmailInviteRequest request){
        // Keep the existing notification listener in the invitation transaction.
        write.executeWithoutResult(status->prepare(diaryId,actor,request));
        return EmailInviteAcknowledgement.accepted();
    }
    private void prepare(UUID diaryId,long actor,EmailInviteRequest request){
        var diary=access.lock(diaryId);access.member(diary,actor);tokens.configured();
        Instant now=Instant.now().truncatedTo(ChronoUnit.MICROS);
        attempts.reserve(diaryId,actor,request.email(),now);
        var recipient=users.findByEmail(request.email()).filter(u->u.isActive()).orElse(null);
        if(recipient==null)return;
        blocks.lockPair(actor,recipient.getUserId());
        if(blocks.between(actor,recipient.getUserId()))return;
        if(members.findById(new DiaryMemberId(diaryId,recipient.getUserId())).filter(DiaryMember::active).isPresent())return;
        var pending=invites.pendingEmail(diaryId,recipient.getUserId()).orElse(null);
        if(pending!=null){
            if(tokens.matches(pending,tokens.token(pending)))return;
            pending.cancel(Instant.now());
        }
        var recent=invites.recentEmails(diaryId,recipient.getUserId(),now.minusSeconds(SharingPolicy.INVITE_WINDOW_SECONDS));
        if(recent.size()>=SharingPolicy.MAX_INVITES){
            // Durable send quota remains authoritative after restarts/across instances.
            // Its outcome must not expose whether a matching account exists.
            return;
        }
        boolean shared=inventory.shared(diaryId);
        var invite=invites.saveAndFlush(DiaryInvite.email(diaryId,actor,recipient.getUserId(),now));
        String token=tokens.token(invite);invite.initializeHash(tokens.hash(token));diary.updateSettings(null,null,null,"MEMBERS");
        entities.flush();
        inventory.sharedDiaryChanged(diaryId,shared,null);
        events.publishEvent(new com.f106.DIO.notification.event.InvitationConfirmedEvent(UUID.randomUUID(),invite.getInviteId(),recipient.getUserId(),now));
    }
    @Transactional(readOnly=true)
    public DiaryInvitationsResponse sent(UUID diaryId,long actor,int page,int size){
        var diary=access.read(diaryId);access.readMember(diary,actor);
        var current=links.current(diaryId,actor);
        return new DiaryInvitationsResponse(current.available(),current.token(),current.inviteUrl(),current.expiresAt(),current.token()==null?null:tokens.id(current.token()).toString(),views.page(invites.sentEmails(diaryId,pagination(page,size))));
    }
    @Transactional(readOnly=true)
    public EmailInvitePageResponse received(long actor,int page,int size){
        access.activeUser(actor);tokens.configured();return views.page(invites.receivedEmails(actor,pagination(page,size)));
    }
    @Transactional
    public void cancel(UUID diaryId,long actor,long inviteId){
        var diary=access.lock(diaryId);access.member(diary,actor);
        var invite=invites.findById(inviteId).filter(i->i.getDiaryId().equals(diaryId)).orElseThrow(tokens::notFound);
        if("CANCELLED".equals(invite.status()))return;
        if(invite.email()&&!invite.pendingEmail())throw conflict();
        invite.cancel(Instant.now());
    }
    @Transactional
    public void decline(long inviteId,long actor){
        access.activeUser(actor);
        var invite=recipientInvite(inviteId,actor);
        access.lock(invite.getDiaryId());
        // Cancellation/acceptance may commit while waiting for the diary lock.
        try {entities.refresh(invite);}
        catch(jakarta.persistence.EntityNotFoundException deleted){throw tokens.notFound();}
        invite=recipientInvite(inviteId,actor);
        if("DECLINED".equals(invite.status()))return;
        if(!invite.pendingEmail())throw conflict();
        invite.decline(Instant.now());
    }
    private DiaryInvite recipientInvite(long id,long actor){
        return invites.findById(id).filter(i->i.email()&&Long.valueOf(actor).equals(i.getInviteeUserId()))
            .orElseThrow(tokens::notFound);
    }
    private PageRequest pagination(int page,int size){
        if(page<0||size<1||size>100)throw SharingException.invalid("page는 0 이상, size는 1~100으로 입력해 주세요.");
        return PageRequest.of(page,size,Sort.by(Sort.Direction.DESC,"createdAt","inviteId"));
    }
    private SharingException conflict(){return new SharingException(HttpStatus.CONFLICT,"INVITE_ALREADY_PROCESSED","이미 처리된 초대예요.");}
}
