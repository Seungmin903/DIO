package com.f106.DIO.user.config;

import com.f106.DIO.user.infrastructure.storage.ProfilePhotoFiles;
import com.f106.DIO.user.repository.ProfilePhotoRepository;
import com.f106.DIO.user.service.ProfilePhotoMigrationService;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "dio.signup.photos.migrate-legacy", havingValue = "true")
public class ProfilePhotoMigrationRunner implements ApplicationRunner {
    private final ProfilePhotoRepository photos;
    private final ProfilePhotoMigrationService migration;
    private final ProfilePhotoFiles files;
    public ProfilePhotoMigrationRunner(ProfilePhotoRepository photos, ProfilePhotoMigrationService migration, ProfilePhotoFiles files) {
        this.photos = photos; this.migration = migration; this.files = files;
    }
    public void run(ApplicationArguments args) {
        int count = 0, failed = 0;
        java.util.UUID cursor = null;
        var log = org.slf4j.LoggerFactory.getLogger(getClass());
        while (true) {
            var ids = cursor == null ? photos.migrationPhotoIds(files.provider(), PageRequest.of(0, 50))
                : photos.migrationPhotoIdsAfter(files.provider(), cursor, PageRequest.of(0, 50));
            if (ids.isEmpty()) break;
            for (var id : ids) {
                try { migration.migrate(id); count++; }
                catch (RuntimeException error) {
                    failed++;
                    // 저장소 예외 본문에는 서명 URL·자격 증명이 포함될 수 있어 출력하지 않는다.
                    log.warn("Profile photo migration failed: id={}, provider={}, errorType={}",
                        id, files.provider(), error.getClass().getSimpleName());
                }
                cursor = id; // 실패한 행도 지나가므로 한 실행에서 반복 선택하지 않는다.
            }
        }
        log.info("Profile photo migration completed: migrated={}, failed={}, provider={}", count, failed, files.provider());
    }
}
