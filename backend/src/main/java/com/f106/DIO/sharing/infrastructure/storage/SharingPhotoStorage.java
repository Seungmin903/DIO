package com.f106.DIO.sharing.infrastructure.storage;
import com.f106.DIO.sharing.domain.SharingProfileMedia;
import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.user.infrastructure.storage.*;
import com.f106.DIO.user.exception.UserException;
import com.f106.DIO.user.support.ProfilePhotoImages;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
@Component
public class SharingPhotoStorage {
    private final ProfilePhotoFiles files;private final ProfilePhotoStorage active;
    public SharingPhotoStorage(ProfilePhotoFiles files,List<ProfilePhotoStorage> stores){
        this.files=files;active=stores.stream().filter(s->s.provider().equals(files.provider())).findFirst().orElseThrow();
    }
    public byte[] prepare(MultipartFile file){try{return ProfilePhotoImages.prepare(file);}catch(UserException e){throw mapped(e);}}
    public ProfilePhotoFiles.PendingPhoto upload(UUID id,byte[] bytes){try{return files.upload(id,bytes);}catch(UserException e){throw mapped(e);}}
    public byte[] read(SharingProfileMedia media){
        var location=active.location(media.getMediaFileId());
        if(!location.key().equals(media.getStorageKey()))throw SharingException.invalid("다이어리 프로필 사진 저장 경로를 확인해 주세요.");
        try{return active.read(location);}catch(UserException e){throw mapped(e);}
    }
    private SharingException mapped(UserException e){return new SharingException(e.status,e.code,e.getMessage());}
}
