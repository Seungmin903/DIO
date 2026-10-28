package com.f106.DIO.media.storage;

import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

public class S3MediaStorage implements MediaStorage {
	private final S3Client client;
	private final String bucket;
	public S3MediaStorage(S3Client client, String bucket) { this.client = client; this.bucket = bucket; }
	@Override public String provider() { return "S3"; }
	@Override public void put(String key, byte[] content, String contentType) {
		MediaStorageKeys.validate(key);
		try { client.putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType(contentType).build(), RequestBody.fromBytes(content)); }
		catch (SdkException error) { throw MediaStorageException.unavailable(); }
	}
	@Override public byte[] read(String key) {
		MediaStorageKeys.validate(key);
		try {
			ResponseBytes<GetObjectResponse> object = client.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(key).build());
			return object.asByteArray();
		} catch (NoSuchKeyException error) { throw MediaStorageException.missing(); }
		catch (SdkException error) { throw MediaStorageException.unavailable(); }
	}
	@Override public void delete(String key) {
		MediaStorageKeys.validate(key);
		try { client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build()); }
		catch (SdkException error) { throw MediaStorageException.unavailable(); }
	}
}
