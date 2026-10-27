package com.f106.DIO.auth.repository;

import com.f106.DIO.auth.domain.RefreshToken;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.*;
import jakarta.persistence.LockModeType;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    @Modifying
    @Query("update RefreshToken t set t.revokedAt = :now where t.userId = :userId and t.revokedAt is null")
    int revokeAllForUser(Long userId, java.time.Instant now);
    @Query("select t.tokenId from RefreshToken t where t.expiresAt <= :cutoff order by t.expiresAt, t.tokenId")
    public java.util.List<Long> findExpiredIds(java.time.Instant cutoff, org.springframework.data.domain.Pageable page);
    @Query("select t.tokenId from RefreshToken t where t.tokenHash = :hash")
    public Optional<Long> findIdByTokenHash(String hash);
    @Query("select t.tokenId from RefreshToken t where t.sessionId = :sessionId")
    public Optional<Long> findIdBySessionId(UUID sessionId);
    public Optional<RefreshToken> findBySessionId(UUID sessionId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from RefreshToken t where t.tokenId = :id")
    public Optional<RefreshToken> findForUpdate(Long id);
}
