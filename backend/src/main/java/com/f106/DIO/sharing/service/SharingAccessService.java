package com.f106.DIO.sharing.service;
import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.domain.DiaryMemberId;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.sharing.domain.*;
import com.f106.DIO.sharing.exception.SharingException;
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
    public Diary read(UUID id) {return diaries.findByDiaryIdAndDeletedAtIsNull(id).orElseThrow(SharingException::missing);}
    public DiaryMember readMember(Diary diary,long actor) {
        activeUser(actor);
        var stored=members.findById(new DiaryMemberId(diary.getDiaryId(),actor));
        if(stored.isPresent())return stored.filter(DiaryMember::active).filter(DiaryMember::supportedRole).orElseThrow(SharingException::forbidden);
        if(Long.valueOf(actor).equals(diary.getOwnerUserId()))return ownerView(diary);
        throw SharingException.forbidden();
    }
    public java.util.List<DiaryMember> visibleMembers(Diary diary) {
        var result=new java.util.ArrayList<>(members.findByDiaryIdAndLeftAtIsNullOrderByJoinedAtAscUserIdAsc(diary.getDiaryId()));
        Long owner=diary.getOwnerUserId();
        if(owner!=null&&members.findById(new DiaryMemberId(diary.getDiaryId(),owner)).isEmpty()) {
            activeUser(owner);result.add(0,ownerView(diary));
        }
        return result;
    }
    // Legacy owners are represented without inserting rows during GET requests.
    // The first authorized mutation still initializes their persistent membership under the diary lock.
    private DiaryMember ownerView(Diary diary) {
        // Random diary UUID provides a stable pseudo-random legacy color without persisting on GET.
        // The same view is persisted on the first mutation so a profile edit never changes its cursor.
        var random=new java.util.Random(diary.getDiaryId().getMostSignificantBits()^diary.getDiaryId().getLeastSignificantBits()^diary.getOwnerUserId());
        var used=members.findByDiaryIdAndLeftAtIsNullOrderByJoinedAtAscUserIdAsc(diary.getDiaryId()).stream()
            .map(DiaryMember::getMemberColor).collect(java.util.stream.Collectors.toSet());
        String color;
        do {color=String.format("#%02X%02X%02X",random.nextInt(145)+64,random.nextInt(145)+64,random.nextInt(145)+64);}while(used.contains(color));
        return new DiaryMember(diary.getDiaryId(),diary.getOwnerUserId(),"OWNER",color,diary.getCreatedAt());
    }
    public User activeUser(long id) {
        return users.findById(id).filter(User::isActive).orElseThrow(SharingException::forbidden);
    }
    public void initializeOwner(Diary diary) {
        Long owner=diary.getOwnerUserId();
        if(owner==null)throw SharingException.forbidden();
        var key=new DiaryMemberId(diary.getDiaryId(),owner);
        if(members.findById(key).isEmpty()) {
            activeUser(owner);
            members.saveAndFlush(ownerView(diary));
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
        return com.f106.DIO.diary.support.MemberCursorColors.choose(used);
    }
    public void owner(Diary diary,long actor) {
        DiaryMember member=member(diary,actor);
        if(!Long.valueOf(actor).equals(diary.getOwnerUserId())||!"OWNER".equals(member.getRole()))throw SharingException.forbidden();
    }
}
