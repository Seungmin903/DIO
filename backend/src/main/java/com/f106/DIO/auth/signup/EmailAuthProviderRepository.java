package com.f106.DIO.auth.signup;
import org.springframework.data.jpa.repository.JpaRepository;
public interface EmailAuthProviderRepository extends JpaRepository<EmailAuthProvider, Long> {
    java.util.Optional<EmailAuthProvider> findByProviderAndProviderUserId(String provider, String providerUserId);
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select a from EmailAuthProvider a where a.provider = :provider and a.providerUserId = :email")
    java.util.Optional<EmailAuthProvider> findForUpdate(String provider, String email);
}
