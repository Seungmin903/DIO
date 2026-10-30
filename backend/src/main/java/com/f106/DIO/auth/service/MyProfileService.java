package com.f106.DIO.auth.service;

import com.f106.DIO.auth.dto.LoginUserResponse;
import com.f106.DIO.auth.exception.LoginException;
import com.f106.DIO.user.domain.ProfilePhoto;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.ProfilePhotoRepository;
import com.f106.DIO.user.repository.UserRepository;
import java.time.Instant;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MyProfileService {
    private final UserRepository users;
    private final ProfilePhotoRepository photos;
    public MyProfileService(UserRepository users, ProfilePhotoRepository photos) { this.users = users; this.photos = photos; }
    @Transactional(readOnly = true)
    public LoginUserResponse get(Jwt jwt) { return response(activeUser(jwt)); }
    @Transactional
    public LoginUserResponse rename(Jwt jwt, String nickname) {
        User user = activeUser(jwt);
        // 같은 닉네임이면 수정 시각을 바꾸지 않는다.
        if (!nickname.equals(user.getNickname())) user.changeNickname(nickname, Instant.now());
        return response(user);
    }
    private User activeUser(Jwt jwt) {
        long id;
        try { id = Long.parseLong(jwt.getSubject()); } catch (RuntimeException error) { throw LoginException.token(); }
        return users.findById(id).filter(User::isActive).orElseThrow(LoginException::token);
    }
    private LoginUserResponse response(User user) {
        String photo = photos.findByUserId(user.getUserId()).map(ProfilePhoto::url).orElse(null);
        return new LoginUserResponse(user.getUserId().toString(), user.getEmail(), user.getNickname(), photo);
    }
}
