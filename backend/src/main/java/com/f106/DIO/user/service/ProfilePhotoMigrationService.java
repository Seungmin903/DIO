package com.f106.DIO.user.service;

import com.f106.DIO.user.domain.ProfilePhoto;
import com.f106.DIO.user.infrastructure.storage.ProfilePhotoFiles;
import com.f106.DIO.user.infrastructure.storage.ProfilePhotoStorage;
import com.f106.DIO.user.repository.ProfilePhotoRepository;

import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProfilePhotoMigrationService {
    private final ProfilePhotoRepository photos;
    private final ProfilePhotoFiles files;
    public ProfilePhotoMigrationService(ProfilePhotoRepository photos, ProfilePhotoFiles files) {
        this.photos = photos; this.files = files;
    }
    @Transactional
    public void migrate(UUID id) {
        ProfilePhoto photo = photos.findForUpdate(id).orElseThrow(ProfilePhotoStorage::missing);
        if (photo.getImageBytes() == null && files.provider().equals(photo.getStorageProvider())) return;
        var location = files.store(photo.getPhotoId(), files.read(photo));
        photo.external(location.provider(), location.key(), location.bucket());
        photos.saveAndFlush(photo);
    }
}
