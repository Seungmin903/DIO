package com.f106.DIO.auth.signup;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
class ProfilePhotoFiles {
    private final Map<String, ProfilePhotoStorage> stores;
    private final ProfilePhotoStorage active;
    ProfilePhotoFiles(List<ProfilePhotoStorage> stores, @Value("${dio.signup.photos.storage:local}") String provider) {
        this.stores = stores.stream().collect(Collectors.toMap(ProfilePhotoStorage::provider, Function.identity()));
        active = this.stores.get(provider.toUpperCase(java.util.Locale.ROOT));
        if (active == null) throw new IllegalStateException("Unknown or unconfigured profile photo storage");
    }
    ProfilePhotoStorage.Location store(UUID photoId, byte[] png) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("Profile photo writes require a transaction");
        }
        var location = active.location(photoId);
        // 파일/S3와 DB는 별도 트랜잭션이므로 DB 실패 시 생성한 객체만 보상 삭제한다.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if (status == STATUS_COMMITTED) return;
                try { active.delete(location); }
                catch (RuntimeException error) {
                    LoggerFactory.getLogger(ProfilePhotoFiles.class).warn(
                        "Rolled-back profile photo cleanup failed: provider={}, key={}", location.provider(), location.key());
                }
            }
        });
        active.put(location, png);
        return location;
    }
    byte[] read(SignupProfilePhoto photo) {
        // V4의 기존 사진은 명시적으로 이전하기 전까지 그대로 읽는다.
        if (photo.imageBytes != null) return photo.imageBytes;
        ProfilePhotoStorage storage = stores.get(photo.storageProvider);
        if (storage == null) throw ProfilePhotoStorage.unavailable();
        return storage.read(new ProfilePhotoStorage.Location(photo.storageProvider, photo.storageKey, photo.storageBucket));
    }
    String provider() { return active.provider(); }
}
