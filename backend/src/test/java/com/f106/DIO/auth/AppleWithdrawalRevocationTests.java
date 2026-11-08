package com.f106.DIO.auth;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.f106.DIO.auth.domain.EmailAuthProvider;
import com.f106.DIO.auth.domain.SocialProvider;
import com.f106.DIO.auth.exception.LoginException;
import com.f106.DIO.auth.infrastructure.social.AppleAccountRevoker;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.auth.service.AppleWithdrawalRevocation;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class AppleWithdrawalRevocationTests {
    final EmailAuthProviderRepository accounts = mock(EmailAuthProviderRepository.class);
    final AppleAccountRevoker revoker = mock(AppleAccountRevoker.class);
    final AppleWithdrawalRevocation revocation = new AppleWithdrawalRevocation(accounts, revoker);

    @Test
    void nonAppleMemberWithdrawsWithoutApple() {
        when(accounts.findByUserIdAndProvider(1L, "APPLE")).thenReturn(Optional.empty());
        revocation.revokeIfLinked(1L, null);
        verifyNoInteractions(revoker);
    }

    @Test
    void appleMemberMustReauthenticate() {
        when(accounts.findByUserIdAndProvider(2L, "APPLE"))
            .thenReturn(Optional.of(EmailAuthProvider.social(2L, SocialProvider.APPLE, "apple-sub", Instant.now())));
        for (String missing : new String[] {null, "", "  "}) {
            assertThatThrownBy(() -> revocation.revokeIfLinked(2L, missing))
                .isInstanceOfSatisfying(LoginException.class, e -> assertThat(e.code).isEqualTo("APPLE_REAUTH_REQUIRED"));
        }
        verifyNoInteractions(revoker);
    }

    @Test
    void appleMemberRevokesOwnSubject() {
        when(accounts.findByUserIdAndProvider(3L, "APPLE"))
            .thenReturn(Optional.of(EmailAuthProvider.social(3L, SocialProvider.APPLE, "apple-sub", Instant.now())));
        revocation.revokeIfLinked(3L, "auth-code");
        verify(revoker).revoke("apple-sub", "auth-code");
    }
}
