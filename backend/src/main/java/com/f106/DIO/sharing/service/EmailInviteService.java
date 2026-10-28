package com.f106.DIO.sharing.service;
import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.domain.DiaryMemberId;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.sharing.domain.*;
import com.f106.DIO.sharing.dto.*;
import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.sharing.infrastructure.mail.*;
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
    private final SharingAccessService access;private final DiaryInviteRepository invites;private final DiaryMemberRepository members;
    private final UserRepository users;private final InviteTokens tokens;private final InviteMailSender mail;
    private final org.springframework.transaction.support.TransactionTemplate write;
    private final ApplicationEventPublisher events;private final InviteViews views;private final DiaryInviteService links;
    public EmailInviteService(SharingAccessService access,DiaryInviteRepository invites,DiaryMemberRepository members,UserRepository users,
            InviteTokens tokens,InviteMailSender mail,ApplicationEventPublisher events,InviteViews views,DiaryInviteService links,org.springframework.transaction.PlatformTransactionManager manager){
        this.write=new org.springframework.transaction.support.TransactionTemplate(manager);
        this.access=access;this.invites=invites;this.members=members;this.users=users;this.tokens=tokens;this.mail=mail;this.events=events;this.views=views;this.links=links;
    }
    @Transactional(propagation=org.springframework.transaction.annotation.Propagation.NEVER)
    public EmailInviteAcknowledgement send(UUID diaryId,long actor,EmailInviteRequest request){
        // Publish only after execute returns: even queue rejection recovery cannot retain the caller's DB connection.
        var outgoing=write.execute(status->prepare(diaryId,actor,request));
        if(outgoing!=null)events.publishEvent(outgoing);
        return EmailInviteAcknowledgement.accepted();
    }
    private InviteMailDispatch.Requested prepare(UUID diaryId,long actor,EmailInviteRequest request){
        var diary=access.lock(diaryId);access.member(diary,actor);tokens.emailConfigured();mail.configured();
        var recipient=users.findByEmail(request.email()).filter(u->u.isActive()).orElse(null);
        if(recipient==null)return null;
        if(members.findById(new DiaryMemberId(diaryId,recipient.getUserId())).filter(DiaryMember::active).isPresent())return null;
        var pending=invites.pendingEmail(diaryId,recipient.getUserId()).orElse(null);
        if(pending!=null){
            if(tokens.matches(pending,tokens.token(pending)))return null;
            pending.cancel(Instant.now());
        }
        Instant now=Instant.now().truncatedTo(ChronoUnit.MICROS);
        var recent=invites.recentEmails(diaryId,recipient.getUserId(),now.minusSeconds(SharingPolicy.INVITE_WINDOW_SECONDS));
        if(recent.size()>=SharingPolicy.MAX_INVITES){
            long retry=Math.max(1,(Duration.between(now,recent.get(0).getCreatedAt().plusSeconds(SharingPolicy.INVITE_WINDOW_SECONDS)).toMillis()+999)/1000);
            throw new SharingException(HttpStatus.TOO_MANY_REQUESTS,"EMAIL_INVITE_RATE_LIMITED","같은 다이어리와 수신자에게는 5분에 3회까지 초대할 수 있어요.",retry);
        }
        var invite=invites.saveAndFlush(DiaryInvite.email(diaryId,actor,recipient.getUserId(),now));
        String token=tokens.token(invite);invite.initializeHash(tokens.hash(token));diary.updateSettings(null,null,null,"MEMBERS");
        return new InviteMailDispatch.Requested(invite.getInviteId(),recipient.getEmail(),diary.getTitle(),tokens.url(token));
    }
    @Transactional
    public DiaryInvitationsResponse sent(UUID diaryId,long actor,int page,int size){
        var diary=access.lock(diaryId);access.member(diary,actor);
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
        access.activeUser(actor);UUID diaryId=invites.diaryId(inviteId).orElseThrow(tokens::notFound);access.lock(diaryId);
        var invite=invites.findById(inviteId).orElseThrow(tokens::notFound);
        if(!invite.email()||!Long.valueOf(actor).equals(invite.getInviteeUserId()))throw SharingException.forbidden();
        if("DECLINED".equals(invite.status()))return;
        if(!invite.pendingEmail())throw conflict();
        invite.decline(Instant.now());
    }
    private PageRequest pagination(int page,int size){
        if(page<0||size<1||size>100)throw SharingException.invalid("page는 0 이상, size는 1~100으로 입력해 주세요.");
        return PageRequest.of(page,size,Sort.by(Sort.Direction.DESC,"createdAt","inviteId"));
    }
    private SharingException conflict(){return new SharingException(HttpStatus.CONFLICT,"INVITE_ALREADY_PROCESSED","이미 처리된 초대예요.");}
}
