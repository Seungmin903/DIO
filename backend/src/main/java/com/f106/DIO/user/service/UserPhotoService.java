package com.f106.DIO.user.service;

import com.f106.DIO.user.domain.ProfilePhoto;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.exception.UserException;
import com.f106.DIO.user.infrastructure.storage.ProfilePhotoFiles;
import com.f106.DIO.user.repository.ProfilePhotoRepository;
import com.f106.DIO.user.repository.UserRepository;
import com.f106.DIO.user.support.ProfilePhotoImages;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.HttpStatus;
@Service
public class UserPhotoService {
    private final UserRepository users;
    private final ProfilePhotoRepository photos;
    private final ProfilePhotoFiles files;
    private final TransactionTemplate readTransaction;
    public UserPhotoService(UserRepository users, ProfilePhotoRepository photos, ProfilePhotoFiles files, PlatformTransactionManager manager) {
        this.users = users; this.photos = photos; this.files = files;
        readTransaction = new TransactionTemplate(manager); readTransaction.setReadOnly(true);
    }
    @Transactional(propagation = Propagation.NEVER)
    public byte[] read(UUID id) {
        var photo = readTransaction.execute(status -> {
            var found = photos.findById(id).orElseThrow(this::notFound);
            if (!users.findById(found.getUserId()).filter(User::isActive).isPresent()) throw notFound();
            return found;
        });
        return files.read(photo);
    }
    @Transactional(propagation = Propagation.NEVER)
    public byte[] prepareImage(MultipartFile photo) { return ProfilePhotoImages.prepare(photo); }
    @Transactional(propagation = Propagation.NEVER)
    public PreparedPhoto upload(byte[] bytes) { return bytes == null ? null : new PreparedPhoto(UUID.randomUUID(), bytes); }
    private UserException notFound() { return new UserException(HttpStatus.NOT_FOUND, "PROFILE_PHOTO_NOT_FOUND", "프로필 사진을 찾을 수 없어요."); }
    public final class PreparedPhoto implements AutoCloseable {
        private final UUID id;
        private final ProfilePhotoFiles.PendingPhoto pending;
        private PreparedPhoto(UUID id, byte[] bytes) { this.id = id; pending = files.upload(id, bytes); }
        public void enlist() { pending.enlist(); }
        public String save(Long userId, Instant now) {
            if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("Photo metadata requires a transaction");
            var location = pending.getLocation();
            return photos.saveAndFlush(new ProfilePhoto(id, userId, location.provider(), location.key(), location.bucket(), now)).url();
        }
        @Override public void close() { pending.close(); }
    }
}
