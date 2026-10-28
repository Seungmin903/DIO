package com.f106.DIO.sharing.domain;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
@lombok.Getter
@Entity(name="SharingProfileMedia") @Table(name="media_files")
public class SharingProfileMedia {
    @Id private UUID mediaFileId;
    private Long ownerUserId;
    @Column(nullable=false,length=20) private String mediaType;
    @Column(nullable=false,length=20) private String sourceType;
    @Column(nullable=false,length=20) private String libraryCategory;
    @Column(nullable=false,length=500) private String storageKey;
    @Column(nullable=false,length=100) private String mimeType;
    @Column(nullable=false) private long fileSize;
    private Integer width;private Integer height;
    @Column(nullable=false,length=20) private String status;
    @Column(nullable=false) private Instant createdAt;
    private Instant deletedAt;
    protected SharingProfileMedia(){}
    public SharingProfileMedia(UUID id,long owner,String key,long size,int width,int height,Instant now){
        mediaFileId=id;ownerUserId=owner;storageKey=key;fileSize=size;this.width=width;this.height=height;
        mediaType="IMAGE";sourceType="UPLOAD";libraryCategory="PHOTO";mimeType="image/png";status="READY";createdAt=now;
    }
    public boolean usableBy(long owner){return Long.valueOf(owner).equals(ownerUserId)&&deletedAt==null&&"READY".equals(status)
        &&"IMAGE".equals(mediaType)&&"image/png".equals(mimeType)&&fileSize>0&&fileSize<=1048576
        &&com.f106.DIO.user.infrastructure.storage.ProfilePhotoStorage.key(mediaFileId).equals(storageKey);}
}
