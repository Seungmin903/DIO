package com.f106.DIO.auth.signup;

import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class ProfilePhotoMigrationService {
    private final SignupProfilePhotoRepository photos;
    private final ProfilePhotoFiles files;
    ProfilePhotoMigrationService(SignupProfilePhotoRepository photos, ProfilePhotoFiles files) {
        this.photos = photos; this.files = files;
    }
    @Transactional
    public void migrate(UUID id) {
        SignupProfilePhoto photo = photos.findForUpdate(id).orElseThrow(ProfilePhotoStorage::missing);
        if (photo.imageBytes == null && files.provider().equals(photo.storageProvider)) return;
        var location = files.store(photo.photoId, files.read(photo));
        photo.external(location);
        photos.saveAndFlush(photo);
    }
}
