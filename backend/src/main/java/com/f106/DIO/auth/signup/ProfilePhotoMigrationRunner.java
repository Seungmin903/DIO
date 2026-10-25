package com.f106.DIO.auth.signup;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "dio.signup.photos.migrate-legacy", havingValue = "true")
class ProfilePhotoMigrationRunner implements ApplicationRunner {
    private final SignupProfilePhotoRepository photos;
    private final ProfilePhotoMigrationService migration;
    private final ProfilePhotoFiles files;
    ProfilePhotoMigrationRunner(SignupProfilePhotoRepository photos, ProfilePhotoMigrationService migration, ProfilePhotoFiles files) {
        this.photos = photos; this.migration = migration; this.files = files;
    }
    public void run(ApplicationArguments args) {
        int count = 0;
        while (true) {
            var ids = photos.migrationPhotoIds(files.provider(), PageRequest.of(0, 50));
            if (ids.isEmpty()) break;
            for (var id : ids) { migration.migrate(id); count++; }
        }
        org.slf4j.LoggerFactory.getLogger(getClass()).info("Migrated {} profile photos to {}", count, files.provider());
    }
}
