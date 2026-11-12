package com.f106.DIO.sharing.service;
import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.domain.DiaryMemberId;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.sharing.domain.DiaryMembershipChanged;
import com.f106.DIO.sharing.domain.*;
import com.f106.DIO.sharing.dto.*;
import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.sharing.repository.*;
import com.f106.DIO.user.repository.*;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
@Transactional
public class DiaryMembershipService {
    private final com.f106.DIO.moderation.service.BlockService blocks;
    private final SharingAccessService access;
    private final DiaryMemberRepository members;
    private final DiaryInviteRepository invites;
    private final MemberProfileResolver views;
    private final DiaryPermanentDeletionRepository deletion;
    private final org.springframework.context.ApplicationEventPublisher events;
    public DiaryMembershipService(SharingAccessService access,DiaryMemberRepository members,DiaryInviteRepository invites,
            MemberProfileResolver views,DiaryPermanentDeletionRepository deletion,com.f106.DIO.moderation.service.BlockService blocks,org.springframework.context.ApplicationEventPublisher events) {
        this.blocks=blocks;this.access=access;this.members=members;this.invites=invites;this.views=views;this.deletion=deletion;this.events=events;
    }
    @Transactional(readOnly=true)
    public MemberListResponse list(UUID id,long actor) {
        var diary=access.read(id);access.readMember(diary,actor);
        var blocked=blocks.targets(actor);
        var result=access.visibleMembers(diary).stream().map(views::member).map(v->v.withBlockedByMe(blocked.contains(Long.parseLong(v.userId())))).toList();
        return new MemberListResponse(result,result.size(),SharingPolicy.MAX_MEMBERS);
    }
    public void remove(UUID id,long actor,long target) {
        var diary=access.lock(id);access.member(diary,actor);
        if(actor!=target)access.owner(diary,actor);
        var member=members.findById(new DiaryMemberId(id,target)).filter(DiaryMember::active).orElseThrow(SharingException::forbidden);
        if(Long.valueOf(target).equals(diary.getOwnerUserId())) {
            access.owner(diary,actor);
            var successor=access.visibleMembers(diary).stream()
                .filter(m->m.active()&&m.supportedRole()&&!m.getUserId().equals(target))
                .sorted(java.util.Comparator.comparing(DiaryMember::getJoinedAt).thenComparing(DiaryMember::getUserId)).findFirst();
            if(successor.isEmpty()){deletion.delete(id);return;}
            successor.get().promote();
            diary.transferOwnership(successor.get().getUserId());
            diary.updateSettings(null,null,null,"MEMBERS");
            invites.revokeLinks(id,Instant.now());
        }
        member.leave(Instant.now());
        if(actor!=target)invites.revokeLinks(id,Instant.now());
        events.publishEvent(new DiaryMembershipChanged(id));
    }
}
