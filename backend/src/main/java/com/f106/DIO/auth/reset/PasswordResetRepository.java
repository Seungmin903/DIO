package com.f106.DIO.auth.reset;

import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;

interface PasswordResetRepository extends JpaRepository<PasswordResetVerification, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from PasswordResetVerification r where r.email = :email")
    Optional<PasswordResetVerification> findForUpdate(String email);
}
