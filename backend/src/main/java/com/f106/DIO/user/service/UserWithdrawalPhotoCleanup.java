package com.f106.DIO.user.service;
import com.f106.DIO.user.repository.*;
import com.f106.DIO.user.infrastructure.storage.ProfilePhotoFiles;
import org.springframework.stereotype.Service;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.annotation.*;
@Service
public class UserWithdrawalPhotoCleanup {
    private final ProfilePhotoRepository photos;
    private final UserRepository users;
    private final ProfilePhotoFiles files;
    private final TransactionTemplate read,write;
    private java.util.UUID after;
    public UserWithdrawalPhotoCleanup(ProfilePhotoRepository photos,UserRepository users,ProfilePhotoFiles files,PlatformTransactionManager manager){
        this.photos=photos;this.users=users;this.files=files;read=new TransactionTemplate(manager);read.setReadOnly(true);write=new TransactionTemplate(manager);
    }
    @org.springframework.scheduling.annotation.Scheduled(initialDelayString="${dio.user.withdrawal-photo-cleanup-ms:300000}",fixedDelayString="${dio.user.withdrawal-photo-cleanup-ms:300000}")
    @Transactional(propagation=Propagation.NEVER)
    public synchronized void clean(){
        var page=PageRequest.of(0,100);
        var ids=read.execute(tx->after==null?photos.withdrawnPhotoIds(page):photos.withdrawnPhotoIdsAfter(after,page));
        if(ids.isEmpty()&&after!=null){after=null;ids=read.execute(tx->photos.withdrawnPhotoIds(page));}
        for(var id:ids)try{
            var photo=read.execute(tx->photos.findById(id).filter(p->users.findById(p.getUserId()).map(u->u.getDeletedAt()!=null&&"WITHDRAWN".equals(u.getStatus())).orElse(false)).orElse(null));
            if(photo==null)continue;
            files.delete(photo);
            write.executeWithoutResult(tx->photos.deleteById(id));
        }catch(RuntimeException error){
            org.slf4j.LoggerFactory.getLogger(getClass()).warn("Withdrawn profile photo cleanup retry required: photoId={}, errorType={}",id,error.getClass().getSimpleName());
        }finally{after=id;}
        if(ids.size()<100)after=null;
    }
}
