package com.f106.DIO.user.repository;

import com.f106.DIO.user.domain.ProfilePhoto;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;

public interface ProfilePhotoRepository extends JpaRepository<ProfilePhoto, UUID> {
    @Query("select p.photoId from ProfilePhoto p, User u where p.userId=u.userId and u.deletedAt is not null and u.status='WITHDRAWN' order by p.photoId")
    List<UUID> withdrawnPhotoIds(Pageable page);
    @Query("select p.photoId from ProfilePhoto p, User u where p.userId=u.userId and u.deletedAt is not null and u.status='WITHDRAWN' and p.photoId > :after order by p.photoId")
    List<UUID> withdrawnPhotoIdsAfter(UUID after,Pageable page);
    public Optional<ProfilePhoto> findByUserId(Long userId);
    @Query("select p.photoId from ProfilePhoto p where p.imageBytes is not null or p.storageProvider <> :targetProvider order by p.photoId")
    public List<UUID> migrationPhotoIds(String targetProvider, Pageable page);
    @Query("select p.photoId from ProfilePhoto p where (p.imageBytes is not null or p.storageProvider <> :targetProvider) and p.photoId > :after order by p.photoId")
    public List<UUID> migrationPhotoIdsAfter(String targetProvider, UUID after, Pageable page);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from ProfilePhoto p where p.photoId = :id")
    public Optional<ProfilePhoto> findForUpdate(UUID id);
}
