package com.f106.DIO.auth.signup;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;

public interface SignupProfilePhotoRepository extends JpaRepository<SignupProfilePhoto, UUID> {
    Optional<SignupProfilePhoto> findByUserId(Long userId);
    @Query("select p.photoId from SignupProfilePhoto p where p.imageBytes is not null or p.storageProvider <> :targetProvider order by p.photoId")
    List<UUID> migrationPhotoIds(String targetProvider, Pageable page);
    @Query("select p.photoId from SignupProfilePhoto p where (p.imageBytes is not null or p.storageProvider <> :targetProvider) and p.photoId > :after order by p.photoId")
    List<UUID> migrationPhotoIdsAfter(String targetProvider, UUID after, Pageable page);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from SignupProfilePhoto p where p.photoId = :id")
    Optional<SignupProfilePhoto> findForUpdate(UUID id);
}
