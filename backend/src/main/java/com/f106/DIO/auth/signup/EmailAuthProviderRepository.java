package com.f106.DIO.auth.signup;
import org.springframework.data.jpa.repository.JpaRepository;
public interface EmailAuthProviderRepository extends JpaRepository<EmailAuthProvider, Long> {
    java.util.Optional<EmailAuthProvider> findByProviderAndProviderUserId(String provider, String providerUserId);
}
