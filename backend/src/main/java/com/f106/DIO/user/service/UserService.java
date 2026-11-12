package com.f106.DIO.user.service;

import com.f106.DIO.user.dto.AvailabilityResponse;

import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.exception.UserException;
import com.f106.DIO.user.repository.UserRepository;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
public class UserService {
    private final UserRepository users;
    public UserService(UserRepository users) { this.users = users; }
    @Transactional(readOnly = true)
    public AvailabilityResponse available(String email) { return new AvailabilityResponse(!users.existsByEmail(email)); }
    @Transactional(readOnly = true)
    public void assertAvailable(String email) {
        if (users.existsByEmail(email)) throw UserException.conflict("EMAIL_ALREADY_REGISTERED", "이미 가입된 이메일이에요.");
    }
    @Transactional(propagation = Propagation.MANDATORY)
    public User create(String email, String nickname, Instant now) { return users.saveAndFlush(new User(email, nickname, now)); }
}
