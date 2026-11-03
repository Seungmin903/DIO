package com.f106.DIO.sharing.service;
import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.domain.DiaryMemberId;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.sharing.domain.*;
import com.f106.DIO.sharing.dto.*;
import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.sharing.repository.*;
import com.f106.DIO.sharing.support.InviteTokens;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
@Transactional
public class DiaryInviteService {
    private final SharingAccessService access;
    private final DiaryMemberRepository members;
    private final DiaryInviteRepository invites;
    private final InviteTokens tokens;
    private final jakarta.persistence.EntityManager entities;
    public DiaryInviteService(SharingAccessService access,DiaryMemberRepository members,DiaryInviteRepository invites,InviteTokens tokens,jakarta.persistence.EntityManager entities){
        this.access=access;this.members=members;this.invites=invites;this.tokens=tokens;this.entities=entities;
    }
    @Transactional(readOnly=true)
    public InviteLinkResponse current(UUID id,long actor) {
        var diary=access.read(id);access.readMember(diary,actor);tokens.configured();
        var invite=invites.findFirstByDiaryIdAndInviteTypeAndRevokedAtIsNullOrderByInviteIdDesc(id,"LINK").orElse(null);
        if(invite==null||!invite.getExpiresAt().isAfter(Instant.now()))return new InviteLinkResponse(false,null,null,null);
        String token=tokens.token(invite);
        if(!tokens.matches(invite,token))return new InviteLinkResponse(false,null,null,null);
        return link(invite,token);
    }
    public InviteLinkResponse create(UUID id,long actor) {
        var diary=access.lock(id);access.member(diary,actor);tokens.configured();
        Instant now=Instant.now().truncatedTo(ChronoUnit.MICROS);
        Instant since=now.minusSeconds(SharingPolicy.INVITE_WINDOW_SECONDS);
        if(invites.countByDiaryIdAndInviteTypeAndCreatedAtAfter(id,"LINK",since)>=SharingPolicy.MAX_INVITES) {
            var first=invites.findFirstByDiaryIdAndInviteTypeAndCreatedAtAfterOrderByCreatedAtAsc(id,"LINK",since).orElseThrow();
            long seconds=Math.max(1,(Duration.between(now,first.getCreatedAt().plusSeconds(SharingPolicy.INVITE_WINDOW_SECONDS)).toMillis()+999)/1000);
            throw new SharingException(HttpStatus.TOO_MANY_REQUESTS,"INVITE_RATE_LIMITED","초대 링크는 5분에 3회까지 만들 수 있어요.",seconds);
        }
        invites.revokeLinks(id,now);
        var invite=invites.saveAndFlush(new DiaryInvite(id,actor,now));
        String token=tokens.token(invite);invite.initializeHash(tokens.hash(token));
        diary.updateSettings(null,null,null,"MEMBERS");
        return link(invite,token);
    }
    @Transactional(readOnly=true)
    public InvitePreviewResponse preview(String token) {return preview(token,null);}
    @Transactional(readOnly=true)
    public InvitePreviewResponse preview(String token,Long actor) {
        long inviteId=tokens.id(token);
        var invite=valid(inviteId,token,actor);UUID id=invite.getDiaryId();
        var diary=access.read(id);
        int count=access.visibleMembers(diary).size();
        return new InvitePreviewResponse(id,diary.getTitle(),invite.publicExpiresAt(),count,SharingPolicy.MAX_MEMBERS,count>=SharingPolicy.MAX_MEMBERS,invite.email()?"EMAIL":"LINK",invite.status());
    }
    public InviteAcceptResponse accept(String token,long actor) {
        long inviteId=tokens.id(token);
        var invite=valid(inviteId,token,actor);UUID id=invite.getDiaryId();
        var diary=access.lock(id);
        // Another transaction may have cancelled/consumed the invite while we waited.
        // Refresh the first-level JPA cache before validating again under the parent lock.
        entities.refresh(invite);invite=valid(inviteId,token,actor);
        access.activeUser(actor);access.initializeOwner(diary);
        var member=members.findById(new DiaryMemberId(id,actor)).orElse(null);
        int count=Math.toIntExact(members.countByDiaryIdAndLeftAtIsNull(id));
        if(member!=null&&member.active()) {
            if(!member.supportedRole())throw SharingException.forbidden();
            if(invite.pendingEmail())invite.acceptedEmail(Instant.now());
            return new InviteAcceptResponse(id,member.getRole(),true,count,SharingPolicy.MAX_MEMBERS);
        }
        if(invite.email()&&!invite.pendingEmail())throw new SharingException(HttpStatus.GONE,"INVITE_ALREADY_USED","이미 사용한 이메일 초대예요.");
        if(count>=SharingPolicy.MAX_MEMBERS)throw new SharingException(HttpStatus.CONFLICT,"DIARY_MEMBER_LIMIT_REACHED","최대 4명까지 참여할 수 있어요.");
        if(invite.getMaxUses()!=null&&invite.getUseCount()>=invite.getMaxUses())throw new SharingException(HttpStatus.GONE,"INVITE_EXHAUSTED","사용이 끝난 초대 링크예요.");
        var user=access.activeUser(actor);
        if(member==null)members.save(new DiaryMember(id,actor,"EDITOR",access.cursorColor(id),Instant.now()));
        else member.rejoin(Instant.now());
        if(invite.email())invite.acceptedEmail(Instant.now());else invite.used();
        // Joining by a shared link also consumes a pending invitation for this recipient.
        invites.pendingEmail(id,actor).ifPresent(i->i.acceptedEmail(Instant.now()));
        return new InviteAcceptResponse(id,"EDITOR",false,count+1,SharingPolicy.MAX_MEMBERS);
    }
    private DiaryInvite valid(long id,String token,Long actor) {
        tokens.configured();var invite=invites.findById(id).orElseThrow(tokens::notFound);
        if((!"LINK".equals(invite.getInviteType())&&!invite.email())||!tokens.matches(invite,token))throw tokens.notFound();
        if(invite.email()) {
            if(actor==null)throw new SharingException(HttpStatus.UNAUTHORIZED,"INVALID_TOKEN","초대받은 계정으로 로그인해 주세요.");
            access.activeUser(actor);
            if(!actor.equals(invite.getInviteeUserId()))throw SharingException.forbidden();
        }
        if(invite.getRevokedAt()!=null)throw new SharingException(HttpStatus.GONE,"INVITE_REVOKED","새 초대 링크를 요청해 주세요.");
        if(!invite.getExpiresAt().isAfter(Instant.now()))throw new SharingException(HttpStatus.GONE,"INVITE_EXPIRED","초대가 만료됐어요.");
        return invite;
    }
    private InviteLinkResponse link(DiaryInvite invite,String token) {return new InviteLinkResponse(true,token,tokens.url(token),invite.getExpiresAt());}
}
