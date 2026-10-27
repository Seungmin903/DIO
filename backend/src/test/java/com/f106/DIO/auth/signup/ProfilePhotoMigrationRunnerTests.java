package com.f106.DIO.auth.signup;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

@ExtendWith(OutputCaptureExtension.class)
class ProfilePhotoMigrationRunnerTests {
    @Test void failedPhotoIsLoggedOnceAndLaterPagesContinue(CapturedOutput output) {
        var photos = mock(SignupProfilePhotoRepository.class);
        var migration = mock(ProfilePhotoMigrationService.class);
        var files = mock(ProfilePhotoFiles.class);
        var bad = new UUID(0, 1); var good = new UUID(0, 2); var next = new UUID(0, 3);
        when(files.provider()).thenReturn("S3");
        when(photos.migrationPhotoIds(eq("S3"), any())).thenReturn(List.of(bad, good));
        when(photos.migrationPhotoIdsAfter(eq("S3"), eq(good), any())).thenReturn(List.of(next));
        when(photos.migrationPhotoIdsAfter(eq("S3"), eq(next), any())).thenReturn(List.of());
        doThrow(new IllegalStateException("sensitive storage error")).when(migration).migrate(bad);
        assertThatCode(() -> new ProfilePhotoMigrationRunner(photos, migration, files)
            .run(new DefaultApplicationArguments())).doesNotThrowAnyException();
        verify(migration).migrate(bad); verify(migration).migrate(good); verify(migration).migrate(next);
        verify(photos, times(1)).migrationPhotoIds(eq("S3"), any());
        assertThat(output.getOut()).contains(bad.toString(), "migrated=2, failed=1").doesNotContain("sensitive storage error");
    }
    @Test void signupConfigurationNeverPrintsSecret() {
        var properties = new SignupProperties("private-signup-secret", "mail@example.com", "v1", "v1", "v1");
        assertThat(properties.toString()).isEqualTo("SignupProperties[verificationSecret=REDACTED]")
            .doesNotContain(properties.verificationSecret());
    }
}
