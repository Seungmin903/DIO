package com.f106.DIO.auth.signup;

import java.io.IOException;
import java.util.UUID;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

class S3ProfilePhotoStorage implements ProfilePhotoStorage {
    private final S3Client client;
    private final String bucket;
    S3ProfilePhotoStorage(S3Client client, String bucket) { this.client = client; this.bucket = bucket; }
    public String provider() { return "S3"; }
    public Location location(UUID id) { return new Location(provider(), ProfilePhotoStorage.key(id), bucket); }
    public void put(Location location, byte[] png) {
        ProfilePhotoStorage.validateKey(location.key());
        try {
            client.putObject(PutObjectRequest.builder().bucket(location.bucket()).key(location.key())
                .contentType("image/png").build(), RequestBody.fromBytes(png));
        } catch (SdkException error) { throw ProfilePhotoStorage.unavailable(); }
    }
    public byte[] read(Location location) {
        ProfilePhotoStorage.validateKey(location.key());
        try (var input = client.getObject(GetObjectRequest.builder().bucket(location.bucket()).key(location.key()).build())) {
            byte[] data = input.readNBytes(1024 * 1024 + 1);
            if (data.length == 0 || data.length > 1024 * 1024) throw ProfilePhotoStorage.unavailable();
            return data;
        } catch (NoSuchKeyException error) { throw ProfilePhotoStorage.missing(); }
        catch (SdkException | IOException error) { throw ProfilePhotoStorage.unavailable(); }
    }
    public void delete(Location location) {
        ProfilePhotoStorage.validateKey(location.key());
        try { client.deleteObject(DeleteObjectRequest.builder().bucket(location.bucket()).key(location.key()).build()); }
        catch (SdkException error) { throw ProfilePhotoStorage.unavailable(); }
    }
}
