package com.f106.DIO.auth.login;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.*;
import jakarta.persistence.LockModeType;

interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    @Modifying
    @Query("update RefreshToken t set t.revokedAt = :now where t.userId = :userId and t.revokedAt is null")
    int revokeAllForUser(Long userId, java.time.Instant now);
    @Query("select t.tokenId from RefreshToken t where t.tokenHash = :hash")
    Optional<Long> findIdByTokenHash(String hash);
    @Query("select t.tokenId from RefreshToken t where t.sessionId = :sessionId")
    Optional<Long> findIdBySessionId(UUID sessionId);
    Optional<RefreshToken> findBySessionId(UUID sessionId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from RefreshToken t where t.tokenId = :id")
    Optional<RefreshToken> findForUpdate(Long id);
}
