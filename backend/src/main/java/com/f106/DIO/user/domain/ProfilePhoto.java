package com.f106.DIO.user.domain;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@lombok.Getter
@Entity @Table(name = "signup_profile_photos")
public class ProfilePhoto {
    @Id private UUID photoId;
    @Column(nullable = false, unique = true) private Long userId;
    @JdbcTypeCode(SqlTypes.VARBINARY) @Column(columnDefinition = "bytea") private byte[] imageBytes;
    @Column(length = 10) private String storageProvider;
    @Column(length = 200) private String storageKey;
    @Column(length = 255) private String storageBucket;
    @Column(nullable = false) private Instant createdAt;
    protected ProfilePhoto() {}
    public ProfilePhoto(Long userId, byte[] imageBytes, Instant now) {
        photoId = UUID.randomUUID(); this.userId = userId; this.imageBytes = imageBytes; createdAt = now;
    }
    public ProfilePhoto(UUID photoId, Long userId, String provider, String key, String bucket, Instant now) {
        this.photoId = photoId; this.userId = userId; createdAt = now; external(provider, key, bucket);
    }
    public void external(String provider, String key, String bucket) {
        storageProvider = provider; storageKey = key; storageBucket = bucket;
        imageBytes = null;
    }
    public String url() { return "/api/v1/auth/profile-photos/" + photoId; }
}
