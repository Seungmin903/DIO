package com.f106.DIO.sharing.service;
import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.sharing.domain.*;
import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.sharing.repository.DiaryMemberRepository;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
@Service
public class SharingAccessService {
    private final DiaryRepository diaries;
    private final DiaryMemberRepository members;
    private final UserRepository users;
    public SharingAccessService(DiaryRepository diaries,DiaryMemberRepository members,UserRepository users) {
        this.diaries=diaries;this.members=members;this.users=users;
    }
    // Caller holds a transaction; all sharing mutations serialize on this same diary row.
    public Diary lock(UUID id) {return diaries.findForUpdate(id).orElseThrow(SharingException::missing);}
    public User activeUser(long id) {
        return users.findById(id).filter(User::isActive).orElseThrow(SharingException::forbidden);
    }
    public void initializeOwner(Diary diary) {
        Long owner=diary.getOwnerUserId();
        if(owner==null)throw SharingException.forbidden();
        var key=new DiaryMemberId(diary.getDiaryId(),owner);
        if(members.findById(key).isEmpty()) {
            User user=activeUser(owner);
            members.saveAndFlush(new DiaryMember(diary.getDiaryId(),owner,"OWNER",cursorColor(diary.getDiaryId()),Instant.now()));
        }
    }
    public DiaryMember member(Diary diary,long actor) {
        activeUser(actor);initializeOwner(diary);
        return members.findById(new DiaryMemberId(diary.getDiaryId(),actor))
            .filter(DiaryMember::active).filter(DiaryMember::supportedRole).orElseThrow(SharingException::forbidden);
    }
    public String cursorColor(UUID diary){
        var used=members.findByDiaryIdAndLeftAtIsNullOrderByJoinedAtAscUserIdAsc(diary).stream()
            .map(DiaryMember::getMemberColor).collect(java.util.stream.Collectors.toSet());
        return com.f106.DIO.sharing.support.MemberCursorColors.choose(used);
    }
    public void owner(Diary diary,long actor) {
        DiaryMember member=member(diary,actor);
        if(!Long.valueOf(actor).equals(diary.getOwnerUserId())||!"OWNER".equals(member.getRole()))throw SharingException.forbidden();
    }
}
