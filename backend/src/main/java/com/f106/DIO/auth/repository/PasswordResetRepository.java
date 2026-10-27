package com.f106.DIO.auth.repository;

import com.f106.DIO.auth.domain.PasswordResetVerification;

import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;

public interface PasswordResetRepository extends JpaRepository<PasswordResetVerification, String> {
    @Query("select v.email from PasswordResetVerification v where v.expiresAt < :cutoff and (v.tokenExpiresAt is null or v.tokenExpiresAt < :cutoff) order by v.email")
    java.util.List<String> findExpiredEmails(java.time.Instant cutoff, org.springframework.data.domain.Pageable page);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from PasswordResetVerification r where r.email = :email")
    Optional<PasswordResetVerification> findForUpdate(String email);
}
