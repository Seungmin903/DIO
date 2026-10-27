package com.f106.DIO.user.infrastructure.storage;

import com.f106.DIO.user.exception.UserException;

import java.util.UUID;

/** 축소된 프로필 PNG 전용. 경로/버킷은 API 입력으로 받지 않는다. */
public interface ProfilePhotoStorage {
    public String provider();
    public Location location(UUID photoId);
    public void put(Location location, byte[] png);
    public byte[] read(Location location);
    public void delete(Location location);

    public record Location(String provider, String key, String bucket) {}

    public static String key(UUID id) { return "profile-photos/" + id + ".png"; }
    public static void validateKey(String key) {
        if (key == null || !key.matches("profile-photos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.png")) {
            throw new IllegalArgumentException("Invalid profile photo storage key");
        }
    }
    public static UserException unavailable() {
        return new UserException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
            "PROFILE_PHOTO_STORAGE_UNAVAILABLE", "프로필 사진 저장소에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");
    }
    public static UserException missing() {
        return new UserException(org.springframework.http.HttpStatus.NOT_FOUND,
            "PROFILE_PHOTO_NOT_FOUND", "프로필 사진을 찾을 수 없어요.");
    }
}
