package com.f106.DIO.sharing.service;
import com.f106.DIO.sharing.domain.DiaryMember;
import com.f106.DIO.sharing.dto.*;
import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.sharing.repository.SharingProfileMediaRepository;
import com.f106.DIO.user.repository.*;
import org.springframework.stereotype.Component;
@Component
public class MemberProfileResolver {
    private final UserRepository users;private final ProfilePhotoRepository accounts;private final SharingProfileMediaRepository media;
    public MemberProfileResolver(UserRepository users,ProfilePhotoRepository accounts,SharingProfileMediaRepository media){this.users=users;this.accounts=accounts;this.media=media;}
    public MemberResponse member(DiaryMember member){
        var user=users.findById(member.getUserId()).orElseThrow(SharingException::forbidden);
        boolean active=user.isActive();
        var custom=active&&member.getMemberProfilePhotoId()!=null?media.findById(member.getMemberProfilePhotoId()).filter(m->m.usableBy(member.getUserId())).orElse(null):null;
        String url=custom!=null?"/api/v1/diaries/"+member.getDiaryId()+"/members/"+member.getUserId()+"/profile-photo?v="+custom.getMediaFileId():
            active?accounts.findByUserId(user.getUserId()).map(p->p.url()).orElse(null):null;
        return new MemberResponse(user.getUserId().toString(),member.getRole(),active?(member.getMemberNickname()==null?user.getNickname():member.getMemberNickname()):"탈퇴한 사용자",
            url,active,member.getMemberColor(),active?member.getMemberNickname():null,active?member.getMemberProfilePhotoId():null,custom==null);
    }
    public DiaryProfileResponse profile(DiaryMember member){
        var view=member(member);
        return new DiaryProfileResponse(member.getDiaryId(),view.userId(),view.role(),member.isFavorite(),member.getLastOpenedPageId(),member.getLastOpenedAt(),
            view.nickname(),view.memberNickname(),view.memberProfilePhotoId(),view.profilePhotoUrl(),view.memberColor(),view.usingAccountPhoto());
    }
}
