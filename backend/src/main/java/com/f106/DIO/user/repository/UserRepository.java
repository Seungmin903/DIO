package com.f106.DIO.user.repository;

import com.f106.DIO.user.domain.User;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
public interface UserRepository extends JpaRepository<User, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_READ)
    @org.springframework.data.jpa.repository.Query("select u from User u where u.userId = :id")
    Optional<User> findForPushRegistration(Long id);
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select u from User u where u.userId=:id")
    Optional<User> findForUpdate(Long id);
    public boolean existsByEmail(String email);
    public Optional<User> findByEmail(String email);
}
