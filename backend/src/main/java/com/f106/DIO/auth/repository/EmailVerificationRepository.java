package com.f106.DIO.auth.repository;

import com.f106.DIO.auth.domain.EmailVerification;

import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface EmailVerificationRepository extends JpaRepository<EmailVerification, String> {
    @Query("select v.email from EmailVerification v where v.expiresAt < :cutoff and (v.tokenExpiresAt is null or v.tokenExpiresAt < :cutoff) order by v.email")
    java.util.List<String> findExpiredEmails(java.time.Instant cutoff, org.springframework.data.domain.Pageable page);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from EmailVerification v where v.email = :email")
    public Optional<EmailVerification> findForUpdate(@Param("email") String email);
}
