package com.f106.DIO.auth.signup;

import java.util.UUID;

/** 축소된 프로필 PNG 전용. 경로/버킷은 API 입력으로 받지 않는다. */
interface ProfilePhotoStorage {
    String provider();
    Location location(UUID photoId);
    void put(Location location, byte[] png);
    byte[] read(Location location);
    void delete(Location location);

    record Location(String provider, String key, String bucket) {}

    static String key(UUID id) { return "profile-photos/" + id + ".png"; }
    static void validateKey(String key) {
        if (key == null || !key.matches("profile-photos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.png")) {
            throw new IllegalArgumentException("Invalid profile photo storage key");
        }
    }
    static SignupException unavailable() {
        return new SignupException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
            "PROFILE_PHOTO_STORAGE_UNAVAILABLE", "프로필 사진 저장소에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");
    }
    static SignupException missing() {
        return new SignupException(org.springframework.http.HttpStatus.NOT_FOUND,
            "PROFILE_PHOTO_NOT_FOUND", "프로필 사진을 찾을 수 없어요.");
    }
}
