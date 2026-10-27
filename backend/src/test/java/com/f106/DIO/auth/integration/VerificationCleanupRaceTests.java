package com.f106.DIO.auth.integration;

import com.f106.DIO.auth.domain.EmailVerification;
import com.f106.DIO.auth.repository.EmailVerificationRepository;
import com.f106.DIO.auth.repository.PasswordResetRepository;
import com.f106.DIO.auth.service.ExpiredVerificationCleanup;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class VerificationCleanupRaceTests {
    @Test void resentVerificationIsPreservedAfterCandidateSelection() {
        var signup = mock(EmailVerificationRepository.class);
        var reset = mock(PasswordResetRepository.class);
        var renewed = new EmailVerification("race@example.com");
        renewed.issue("unused-test-hash", Instant.now());
        when(signup.findExpiredEmails(any(), any())).thenReturn(List.of("race@example.com"));
        when(signup.findForUpdate("race@example.com")).thenReturn(Optional.of(renewed));
        when(reset.findExpiredEmails(any(), any())).thenReturn(List.of());
        assertThat(new ExpiredVerificationCleanup(signup, reset).purgeExpired()).isZero();
        verify(signup, never()).delete(any(EmailVerification.class));
    }
}
