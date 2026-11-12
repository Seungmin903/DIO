package com.f106.DIO.sharing.domain;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
@lombok.Getter
@Entity(name="SharingProfileMedia") @Table(name="media_files")
public class SharingProfileMedia {
    @Id @Column(name="media_file_id") private UUID mediaFileId;
    @Column(name="owner_user_id") private Long ownerUserId;
    @Column(name="media_type",nullable=false,length=20) private String mediaType;
    @Column(name="source_type",nullable=false,length=20) private String sourceType;
    @Column(name="library_category",nullable=false,length=20) private String libraryCategory;
    @Column(name="storage_key",nullable=false,length=500) private String storageKey;
    @Column(name="mime_type",nullable=false,length=100) private String mimeType;
    @Column(name="file_size",nullable=false) private long fileSize;
    private Integer width;private Integer height;
    @Column(name="status",nullable=false,length=20) private String status;
    @Column(name="created_at",nullable=false) private Instant createdAt;
    @Column(name="deleted_at") private Instant deletedAt;
    protected SharingProfileMedia(){}
    public SharingProfileMedia(UUID id,long owner,String key,long size,int width,int height,Instant now){
        mediaFileId=id;ownerUserId=owner;storageKey=key;fileSize=size;this.width=width;this.height=height;
        mediaType="IMAGE";sourceType="UPLOAD";libraryCategory="PHOTO";mimeType="image/png";status="READY";createdAt=now;
    }
    public boolean usableBy(long owner){return Long.valueOf(owner).equals(ownerUserId)&&deletedAt==null&&"READY".equals(status)
        &&"IMAGE".equals(mediaType)&&"image/png".equals(mimeType)&&fileSize>0&&fileSize<=1048576
        &&com.f106.DIO.user.infrastructure.storage.ProfilePhotoStorage.key(mediaFileId).equals(storageKey);}
}
