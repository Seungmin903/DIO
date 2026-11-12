package com.f106.DIO.push.service;

import com.f106.DIO.auth.domain.RefreshToken;
import com.f106.DIO.auth.exception.LoginException;
import com.f106.DIO.auth.repository.RefreshTokenRepository;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PushSessionLockTests {
    @Test void checksSessionAgainUnderLockAndRejectsRevocation() {
        var sessions = mock(RefreshTokenRepository.class); var users = mock(UserRepository.class);
        var lock = new PushSessionLock(sessions, users); var now = Instant.parse("2026-01-01T00:00:00Z");
        var sid = UUID.randomUUID(); var jwt = mock(Jwt.class); var session = mock(RefreshToken.class); var user = mock(User.class);
        when(jwt.getClaimAsString("sid")).thenReturn(sid.toString()); when(jwt.getSubject()).thenReturn("42");
        when(sessions.findIdBySessionId(sid)).thenReturn(Optional.of(9L)); when(sessions.findForUpdate(9L)).thenReturn(Optional.of(session));
        when(session.getSessionId()).thenReturn(sid); when(session.getUserId()).thenReturn(42L); when(session.active(any(Instant.class))).thenReturn(true, false);
        when(users.findForPushRegistration(42L)).thenReturn(Optional.of(user)); when(user.isActive()).thenReturn(true);
        assertThat(lock.lockActive(jwt)).isSameAs(session);
        assertThatThrownBy(() -> lock.lockActive(jwt)).isInstanceOf(LoginException.class);
        var order = inOrder(users,sessions); order.verify(users).findForPushRegistration(42L); order.verify(sessions).findIdBySessionId(sid); order.verify(sessions).findForUpdate(9L);
    }
    @Test void rejectsMissingOrMalformedSessionBeforeLookup() {
        var sessions = mock(RefreshTokenRepository.class); var lock = new PushSessionLock(sessions, mock(UserRepository.class)); var jwt = mock(Jwt.class);
        when(jwt.getSubject()).thenReturn("1"); when(jwt.getClaimAsString("sid")).thenReturn("invalid");
        assertThatThrownBy(() -> lock.lockActive(jwt)).isInstanceOf(LoginException.class);
        verifyNoInteractions(sessions);
    }
}
