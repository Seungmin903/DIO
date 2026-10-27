package com.f106.DIO.auth.integration;

import com.f106.DIO.auth.config.SignupProperties;
import com.f106.DIO.auth.domain.EmailVerification;
import com.f106.DIO.auth.exception.SignupException;
import com.f106.DIO.auth.infrastructure.mail.SignupMailSender;
import com.f106.DIO.auth.repository.EmailVerificationRepository;
import com.f106.DIO.auth.service.EmailVerificationService;
import com.f106.DIO.user.repository.UserRepository;

import java.sql.SQLException;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class VerificationInsertFailureTests {
    private final EmailVerificationRepository repository = mock(EmailVerificationRepository.class);
    private final SignupMailSender mail = mock(SignupMailSender.class);
    private final EmailVerificationService service = new EmailVerificationService(repository,
        mock(UserRepository.class), mail,
        new SignupProperties("testing-only-secret-at-least-32-bytes-long", "mail@example.com"));
    private DataIntegrityViolationException failure(String state) {
        return new DataIntegrityViolationException("test persistence failure", new SQLException("test", state));
    }
    @Test void duplicateInsertIsRateLimitedAndDoesNotSendAnotherEmail() {
        when(repository.findForUpdate(anyString())).thenReturn(Optional.empty());
        when(repository.saveAndFlush(any())).thenThrow(failure("23505"));
        assertThatThrownBy(() -> service.send("member@example.com")).isInstanceOfSatisfying(SignupException.class, error -> {
            assertThat(error.status.value()).isEqualTo(429); assertThat(error.code).isEqualTo("VERIFICATION_RATE_LIMITED");
        });
        verifyNoInteractions(mail);
    }
    @Test void otherIntegrityErrorsAreNotHiddenAsRateLimits() {
        for (String state : new String[]{"23502", "23514"}) {
            var error = failure(state);
            doThrow(error).when(repository).saveAndFlush(any());
            assertThatThrownBy(() -> service.send("member@example.com")).isSameAs(error);
        }
        verifyNoInteractions(mail);
    }
    @Test void existingRowFailuresAreNotClassifiedAsNewInsertRaces() {
        var existing = new EmailVerification("member@example.com");
        existing.issue("a".repeat(64), Instant.now().minusSeconds(61)); org.springframework.test.util.ReflectionTestUtils.invokeMethod(existing, "markExisting");
        when(repository.findForUpdate(anyString())).thenReturn(Optional.of(existing));
        var error = failure("23505"); when(repository.saveAndFlush(any())).thenThrow(error);
        assertThatThrownBy(() -> service.send("member@example.com")).isSameAs(error);
        verifyNoInteractions(mail);
    }
}
