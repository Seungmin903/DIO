-- V4 사진 데이터는 삭제하지 않는다. 신규 사진은 외부 저장소 참조만 기록한다.
ALTER TABLE signup_profile_photos ALTER COLUMN image_bytes DROP NOT NULL;
ALTER TABLE signup_profile_photos ADD COLUMN storage_provider VARCHAR(10);
ALTER TABLE signup_profile_photos ADD COLUMN storage_key VARCHAR(200);
ALTER TABLE signup_profile_photos ADD COLUMN storage_bucket VARCHAR(255);
ALTER TABLE signup_profile_photos ADD CONSTRAINT signup_profile_photo_location CHECK (
    (image_bytes IS NOT NULL AND storage_provider IS NULL AND storage_key IS NULL AND storage_bucket IS NULL)
    OR
    (image_bytes IS NULL AND storage_provider IN ('LOCAL', 'S3') AND storage_provider IS NOT NULL
        AND storage_key IS NOT NULL AND
        ((storage_provider = 'LOCAL' AND storage_bucket IS NULL) OR (storage_provider = 'S3' AND storage_bucket IS NOT NULL)))
);
