package com.f106.DIO.sharing.service;
import com.f106.DIO.sharing.domain.DiaryMember;
import com.f106.DIO.sharing.domain.DiaryMemberId;
import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.sharing.infrastructure.storage.SharingPhotoStorage;
import com.f106.DIO.sharing.repository.*;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
@Service
public class DiaryMemberPhotoService {
    private final SharingAccessService access;private final DiaryMemberRepository members;private final SharingProfileMediaRepository media;
    private final SharingPhotoStorage storage;private final TransactionTemplate transaction;
    public DiaryMemberPhotoService(SharingAccessService access,DiaryMemberRepository members,SharingProfileMediaRepository media,SharingPhotoStorage storage,PlatformTransactionManager manager){
        this.access=access;this.members=members;this.media=media;this.storage=storage;transaction=new TransactionTemplate(manager);
    }
    @Transactional(propagation=Propagation.NEVER)
    public byte[] read(UUID diary,long actor,long target){
        var metadata=transaction.execute(tx->{
            access.member(access.lock(diary),actor);
            var member=members.findById(new DiaryMemberId(diary,target)).filter(DiaryMember::active).orElseThrow(this::missing);
            access.activeUser(target);UUID id=member.getMemberProfilePhotoId();if(id==null)throw missing();
            return media.findById(id).filter(m->m.usableBy(target)).orElseThrow(this::missing);
        });
        // The database transaction is closed before local/S3 I/O.
        return storage.read(metadata);
    }
    private SharingException missing(){return new SharingException(HttpStatus.NOT_FOUND,"MEMBER_PHOTO_NOT_FOUND","다이어리 프로필 사진을 찾을 수 없어요.");}
}
