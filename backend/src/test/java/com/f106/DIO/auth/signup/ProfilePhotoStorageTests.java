package com.f106.DIO.auth.signup;

import java.io.ByteArrayInputStream;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ProfilePhotoStorageTests {
    @TempDir Path directory;
    private final byte[] png = {1, 2, 3};
    void begin() {
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.initSynchronization();
    }
    void complete(int status) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            for (var sync : TransactionSynchronizationManager.getSynchronizations()) sync.afterCompletion(status);
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }
    @AfterEach void cleanupTransaction() { complete(TransactionSynchronization.STATUS_ROLLED_BACK); }

    @Test void localFileSurvivesAdapterRecreationAndRejectsTraversal() {
        var storage = new LocalProfilePhotoStorage(directory.toString());
        var location = storage.location(UUID.randomUUID()); storage.put(location, png);
        assertThat(new LocalProfilePhotoStorage(directory.toString()).read(location)).isEqualTo(png);
        assertThatThrownBy(() -> storage.read(new ProfilePhotoStorage.Location("LOCAL", "../../outside.png", null)))
            .isInstanceOf(IllegalArgumentException.class);
        storage.delete(location); storage.delete(location);
        assertThatThrownBy(() -> storage.read(location)).isInstanceOfSatisfying(SignupException.class,
            error -> assertThat(error.code).isEqualTo("PROFILE_PHOTO_NOT_FOUND"));
    }
    @Test void rollbackRemovesOnlyNewPhotoAndCommitKeepsIt() {
        var storage = new LocalProfilePhotoStorage(directory.toString());
        var original = storage.location(UUID.randomUUID()); storage.put(original, png);
        var files = new ProfilePhotoFiles(List.of(storage), "local");
        begin(); var pending = files.store(UUID.randomUUID(), png);
        complete(TransactionSynchronization.STATUS_ROLLED_BACK);
        assertThat(storage.read(original)).isEqualTo(png);
        assertThatThrownBy(() -> storage.read(pending)).isInstanceOf(SignupException.class);
        begin(); var committed = files.store(UUID.randomUUID(), png);
        complete(TransactionSynchronization.STATUS_COMMITTED);
        assertThat(storage.read(committed)).isEqualTo(png);
    }
    @Test void storageMisconfigurationDoesNotSilentlyFallbackAndWritesRequireTransaction() {
        var local = new LocalProfilePhotoStorage(directory.toString());
        assertThatThrownBy(() -> new ProfilePhotoFiles(List.of(local), "s3")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new ProfilePhotoStorageConfig().profilePhotoS3Client("", "ap-northeast-2"))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new ProfilePhotoFiles(List.of(local), "local").store(UUID.randomUUID(), png))
            .isInstanceOf(IllegalStateException.class);
    }
    @Test void s3StoresPrivatePngAndReadsPersistedBucketWithoutAclChanges() throws Exception {
        S3Client client = mock(S3Client.class);
        var storage = new S3ProfilePhotoStorage(client, "new-bucket");
        var location = storage.location(UUID.randomUUID()); storage.put(location, png);
        var request = ArgumentCaptor.forClass(PutObjectRequest.class);
        var body = ArgumentCaptor.forClass(RequestBody.class);
        verify(client).putObject(request.capture(), body.capture());
        assertThat(request.getValue().bucket()).isEqualTo("new-bucket");
        assertThat(request.getValue().contentType()).isEqualTo("image/png");
        assertThat(request.getValue().aclAsString()).isNull();
        try (var input = body.getValue().contentStreamProvider().newStream()) { assertThat(input.readAllBytes()).isEqualTo(png); }
        when(client.getObject(any(GetObjectRequest.class))).thenReturn(
            new ResponseInputStream<>(GetObjectResponse.builder().build(), new ByteArrayInputStream(png)));
        var oldLocation = new ProfilePhotoStorage.Location("S3", location.key(), "old-bucket");
        assertThat(storage.read(oldLocation)).isEqualTo(png);
        verify(client).getObject(argThat((GetObjectRequest value) -> value.bucket().equals("old-bucket")));
        storage.delete(oldLocation);
        verify(client).deleteObject(argThat((DeleteObjectRequest value) -> value.bucket().equals("old-bucket")));
    }
    @Test void s3ErrorsAreSanitizedAndMissingObjectIs404() {
        S3Client client = mock(S3Client.class);
        var storage = new S3ProfilePhotoStorage(client, "bucket");
        var location = storage.location(UUID.randomUUID());
        when(client.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
            .thenThrow(SdkClientException.create("internal credential details"));
        assertThatThrownBy(() -> storage.put(location, png)).isInstanceOf(SignupException.class)
            .hasMessageNotContaining("internal credential");
        when(client.getObject(any(GetObjectRequest.class))).thenThrow(NoSuchKeyException.builder().build());
        assertThatThrownBy(() -> storage.read(location)).isInstanceOfSatisfying(SignupException.class,
            error -> assertThat(error.status.value()).isEqualTo(404));
    }
    @Test void localPhotoCanMigrateToS3WithoutChangingUrlOrDeletingSource() {
        var local = new LocalProfilePhotoStorage(directory.toString());
        UUID photoId = UUID.randomUUID(); var original = local.location(photoId); local.put(original, png);
        var photo = new SignupProfilePhoto(photoId, 1L, original, Instant.now()); String url = photo.url();
        S3Client client = mock(S3Client.class);
        var files = new ProfilePhotoFiles(List.of(local, new S3ProfilePhotoStorage(client, "bucket")), "s3");
        var photos = mock(SignupProfilePhotoRepository.class);
        when(photos.findForUpdate(photoId)).thenReturn(Optional.of(photo));
        begin(); new ProfilePhotoMigrationService(photos, files).migrate(photoId);
        complete(TransactionSynchronization.STATUS_COMMITTED);
        assertThat(photo.url()).isEqualTo(url); assertThat(photo.storageProvider).isEqualTo("S3");
        assertThat(photo.storageBucket).isEqualTo("bucket"); assertThat(photo.imageBytes).isNull();
        assertThat(local.read(original)).isEqualTo(png);
        verify(client).putObject(any(PutObjectRequest.class), any(RequestBody.class));
        verify(photos).saveAndFlush(photo);
    }
}
