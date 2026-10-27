package com.f106.DIO.user.service;

import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.dto.UserDtos;
import com.f106.DIO.user.exception.UserException;
import com.f106.DIO.user.repository.UserRepository;
import com.f106.DIO.user.support.UserInput;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
public class UserService {
    private final UserRepository users;
    public UserService(UserRepository users) { this.users = users; }
    @Transactional(readOnly = true)
    public UserDtos.AvailabilityResponse available(String email) { return new UserDtos.AvailabilityResponse(!users.existsByEmail(email)); }
    @Transactional(readOnly = true)
    public UserDtos.AvailabilityResponse nicknameAvailable(String nickname) { return new UserDtos.AvailabilityResponse(isNicknameAvailable(nickname)); }
    private boolean isNicknameAvailable(String nickname) {
        String key = UserInput.normalizeNickname(nickname).toLowerCase(java.util.Locale.ROOT);
        return !key.equals("관리자") && !key.equals("dio") && !users.existsByNicknameKey(key);
    }
    @Transactional(readOnly = true)
    public void assertAvailable(String email, String nickname) {
        if (users.existsByEmail(email)) throw UserException.conflict("EMAIL_ALREADY_REGISTERED", "이미 가입된 이메일이에요.");
        if (!isNicknameAvailable(nickname)) throw UserException.conflict("NICKNAME_UNAVAILABLE", "사용할 수 없는 닉네임이에요.");
    }
    @Transactional(propagation = Propagation.MANDATORY)
    public User create(String email, String nickname, Instant now) { return users.saveAndFlush(new User(email, nickname, now)); }
}
