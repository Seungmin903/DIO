package com.f106.DIO.user.infrastructure.storage;

import com.f106.DIO.user.domain.ProfilePhoto;

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
public class ProfilePhotoFiles {
    private final Map<String, ProfilePhotoStorage> stores;
    private final ProfilePhotoStorage active;
    public ProfilePhotoFiles(List<ProfilePhotoStorage> stores, @Value("${dio.signup.photos.storage:local}") String provider) {
        this.stores = stores.stream().collect(Collectors.toMap(ProfilePhotoStorage::provider, Function.identity()));
        active = this.stores.get(provider.toUpperCase(java.util.Locale.ROOT));
        if (active == null) throw new IllegalStateException("Unknown or unconfigured profile photo storage");
    }
    public ProfilePhotoStorage.Location store(UUID photoId, byte[] png) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("Profile photo writes require a transaction");
        }
        try (var pending = upload(photoId, png)) { pending.enlist(); return pending.getLocation(); }
    }
    /** 회원가입의 외부 I/O는 DB 트랜잭션 진입 전에 완료한다. */
    public PendingPhoto upload(UUID photoId, byte[] png) {
        var pending = new PendingPhoto(active.location(photoId));
        try { active.put(pending.getLocation(), png); return pending; }
        catch (RuntimeException error) { pending.close(); throw error; }
    }
    public final class PendingPhoto implements AutoCloseable {
        private final ProfilePhotoStorage.Location location;
        public ProfilePhotoStorage.Location getLocation() { return location; }
        private boolean enlisted;
        private boolean cleaned;
        PendingPhoto(ProfilePhotoStorage.Location location) { this.location = location; }
        public void enlist() {
            if (!TransactionSynchronizationManager.isActualTransactionActive() || enlisted)
                throw new IllegalStateException("Photo must be enlisted once in an active transaction");
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    if (status == STATUS_ROLLED_BACK) cleanup();
                    else if (status != STATUS_COMMITTED) LoggerFactory.getLogger(ProfilePhotoFiles.class).warn(
                        "Profile photo commit outcome unknown; object retained: provider={}, key={}", location.provider(), location.key());
                }
            });
            enlisted = true;
        }
        private void cleanup() {
            if (cleaned) return;
            cleaned = true;
            try { active.delete(location); }
            catch (RuntimeException error) { LoggerFactory.getLogger(ProfilePhotoFiles.class).warn(
                "Unreferenced profile photo cleanup failed: provider={}, key={}", location.provider(), location.key()); }
        }
        @Override public void close() { if (!enlisted) cleanup(); }
    }
    public byte[] read(ProfilePhoto photo) {
        // V4의 기존 사진은 명시적으로 이전하기 전까지 그대로 읽는다.
        if (photo.getImageBytes() != null) return photo.getImageBytes();
        ProfilePhotoStorage storage = stores.get(photo.getStorageProvider());
        if (storage == null) throw ProfilePhotoStorage.unavailable();
        return storage.read(new ProfilePhotoStorage.Location(photo.getStorageProvider(), photo.getStorageKey(), photo.getStorageBucket()));
    }
    /** 탈퇴 사진 정리는 DB 트랜잭션 밖에서 수행하며 실패 시 기존 메타데이터로 재시도한다. */
    public void delete(ProfilePhoto photo) {
        if(photo.getImageBytes()!=null)return;
        var storage=stores.get(photo.getStorageProvider());
        if(storage==null)throw ProfilePhotoStorage.unavailable();
        storage.delete(new ProfilePhotoStorage.Location(photo.getStorageProvider(),photo.getStorageKey(),photo.getStorageBucket()));
    }
    public String provider() { return active.provider(); }
}
