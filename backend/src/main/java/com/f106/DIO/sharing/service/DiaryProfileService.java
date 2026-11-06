package com.f106.DIO.sharing.service;
import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.domain.DiaryMemberId;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.sharing.domain.DiaryMembershipChanged;
import com.f106.DIO.sharing.domain.*;
import com.f106.DIO.sharing.dto.*;
import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.sharing.infrastructure.storage.SharingPhotoStorage;
import com.f106.DIO.sharing.repository.*;
import jakarta.validation.Validator;
import java.time.Instant;
import java.util.UUID;
import java.io.ByteArrayInputStream;
import javax.imageio.ImageIO;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
@Service
public class DiaryProfileService {
    private final SharingAccessService access;private final DiaryPermanentDeletionRepository pages;
    private final SharingProfileMediaRepository media;private final SharingPhotoStorage storage;
    private final MemberProfileResolver views;private final Validator validator;private final TransactionTemplate write;private final org.springframework.context.ApplicationEventPublisher events;
    public DiaryProfileService(SharingAccessService access,DiaryPermanentDeletionRepository pages,SharingProfileMediaRepository media,
            SharingPhotoStorage storage,MemberProfileResolver views,Validator validator,PlatformTransactionManager manager,org.springframework.context.ApplicationEventPublisher events){
        this.access=access;this.pages=pages;this.media=media;this.storage=storage;this.views=views;this.validator=validator;this.events=events;write=new TransactionTemplate(manager);
    }
    @Transactional(propagation=Propagation.NEVER)
    public DiaryProfileResponse update(UUID diary,long actor,DiaryProfileUpdateRequest request,MultipartFile photo){
        var errors=validator.validate(request);
        if(!errors.isEmpty())throw SharingException.invalid(errors.iterator().next().getMessage());
        if(!request.hasUpdates()&&photo==null)throw SharingException.invalid("수정할 항목을 입력해 주세요.");
        if(photo!=null&&request.isPhotoProvided())throw SharingException.invalid("사진 업로드와 사진 ID 변경은 한 번에 하나만 선택해 주세요.");
        // Reject unauthorized uploads before decoding or touching storage; recheck under the write lock afterwards.
        write.executeWithoutResult(tx->access.member(access.lock(diary),actor));
        if(photo==null)return write.execute(tx->apply(diary,actor,request));
        byte[] png=storage.prepare(photo);int width,height;
        try{var image=ImageIO.read(new ByteArrayInputStream(png));width=image.getWidth();height=image.getHeight();}
        catch(java.io.IOException e){throw SharingException.invalid("정상적인 사진을 선택해 주세요.");}
        UUID id=UUID.randomUUID();
        try(var pending=storage.upload(id,png)){
            return write.execute(tx->{
                var book=access.lock(diary);var member=access.member(book,actor);
                validatePage(diary,request);pending.enlist();
                media.saveAndFlush(new SharingProfileMedia(id,actor,pending.getLocation().key(),png.length,width,height,Instant.now()));
                updateMember(diary,member,request,true,id);return views.profile(member);
            });
        }
    }
    private DiaryProfileResponse apply(UUID diary,long actor,DiaryProfileUpdateRequest request){
        var member=access.member(access.lock(diary),actor);validatePage(diary,request);
        UUID photoId=request.getMemberProfilePhotoId();
        if(request.isPhotoProvided()&&photoId!=null)
            media.findById(photoId).filter(m->m.usableBy(actor)).orElseThrow(()->SharingException.invalid("본인이 업로드한 유효한 다이어리 프로필 사진을 선택해 주세요."));
        updateMember(diary,member,request,request.isPhotoProvided(),photoId);return views.profile(member);
    }
    private void validatePage(UUID diary,DiaryProfileUpdateRequest request){
        if(request.getLastOpenedPageId()!=null&&!pages.activePage(diary,request.getLastOpenedPageId()))throw SharingException.invalid("이 다이어리의 유효한 페이지를 선택해 주세요.");
    }
    private void updateMember(UUID diary,DiaryMember member,DiaryProfileUpdateRequest request,boolean photoProvided,UUID photoId){
        member.update(request.getFavorite(),request.getLastOpenedPageId(),Instant.now());
        member.changeProfile(request.isNicknameProvided(),request.getNickname(),photoProvided,photoId);
        if(memberIdentityChanged(request,photoProvided))events.publishEvent(new DiaryMembershipChanged(diary));
    }
    // Called inside TransactionTemplate#execute, so the socket's AFTER_COMMIT listener is retained.
    static boolean memberIdentityChanged(DiaryProfileUpdateRequest request,boolean photoProvided){return request.isNicknameProvided()||photoProvided;}
}
