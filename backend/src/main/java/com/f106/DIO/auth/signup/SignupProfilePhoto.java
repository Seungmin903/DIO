package com.f106.DIO.auth.signup;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity @Table(name = "signup_profile_photos")
public class SignupProfilePhoto {
    @Id UUID photoId;
    @Column(nullable = false, unique = true) Long userId;
    @JdbcTypeCode(SqlTypes.VARBINARY) @Column(columnDefinition = "bytea") byte[] imageBytes;
    @Column(length = 10) String storageProvider;
    @Column(length = 200) String storageKey;
    @Column(length = 255) String storageBucket;
    @Column(nullable = false) Instant createdAt;
    protected SignupProfilePhoto() {}
    SignupProfilePhoto(Long userId, byte[] imageBytes, Instant now) {
        photoId = UUID.randomUUID(); this.userId = userId; this.imageBytes = imageBytes; createdAt = now;
    }
    SignupProfilePhoto(UUID photoId, Long userId, ProfilePhotoStorage.Location location, Instant now) {
        this.photoId = photoId; this.userId = userId; createdAt = now; external(location);
    }
    void external(ProfilePhotoStorage.Location location) {
        storageProvider = location.provider(); storageKey = location.key(); storageBucket = location.bucket();
        imageBytes = null;
    }
    public String url() { return "/api/v1/auth/profile-photos/" + photoId; }
}
