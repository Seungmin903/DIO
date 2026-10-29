package com.f106.DIO.user.repository;

import com.f106.DIO.user.domain.User;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
public interface UserRepository extends JpaRepository<User, Long> {
    public boolean existsByEmail(String email);
    public Optional<User> findByEmail(String email);
}
