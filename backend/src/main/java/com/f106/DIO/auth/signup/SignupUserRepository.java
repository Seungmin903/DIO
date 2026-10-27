package com.f106.DIO.auth.signup;
import org.springframework.data.jpa.repository.JpaRepository;
public interface SignupUserRepository extends JpaRepository<SignupUser, Long> {
    boolean existsByEmail(String email);
    boolean existsByNicknameKey(String nicknameKey);
}
