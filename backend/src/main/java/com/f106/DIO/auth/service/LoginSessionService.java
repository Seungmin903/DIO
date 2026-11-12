package com.f106.DIO.auth.service;

import com.f106.DIO.auth.config.LoginProperties;
import com.f106.DIO.auth.config.LoginSessionPolicy;
import com.f106.DIO.auth.domain.RefreshToken;
import com.f106.DIO.auth.dto.LoginResponse;
import com.f106.DIO.auth.dto.LoginUserResponse;
import com.f106.DIO.auth.repository.RefreshTokenRepository;
import com.f106.DIO.auth.security.LoginJwt;
import com.f106.DIO.auth.support.LoginSecrets;
import com.f106.DIO.user.domain.ProfilePhoto;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.ProfilePhotoRepository;
import java.time.Duration;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** Provider-independent DIO session creation; caller owns account validation and transaction. */
@Service
public class LoginSessionService {
    private final RefreshTokenRepository tokens;
    private final ProfilePhotoRepository photos;
    private final LoginJwt jwt;
    private final LoginProperties properties;
    public LoginSessionService(RefreshTokenRepository tokens, ProfilePhotoRepository photos, LoginJwt jwt, LoginProperties properties) {
        this.tokens=tokens;this.photos=photos;this.jwt=jwt;this.properties=properties;
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public LoginResponse create(User user,String deviceName,Instant now) {
        String refresh=LoginSecrets.refresh();
        var token=new RefreshToken(user.getUserId(),LoginSecrets.hash(refresh),deviceName,now,now.plusSeconds(properties.refreshSeconds()));
        var result=response(user,token,refresh,now);
        tokens.saveAndFlush(token);user.recordLogin(now);
        return result;
    }
    public Instant refreshedExpiry(RefreshToken session, Instant now) {
        Instant sliding = now.plusSeconds(properties.refreshSeconds());
        Instant absolute = session.getCreatedAt().plus(LoginSessionPolicy.ABSOLUTE_LIFETIME);
        return sliding.isBefore(absolute) ? sliding : absolute;
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public LoginResponse response(User user,RefreshToken session,String refresh,Instant now) {
        return response(user, session, refresh, now, session.getExpiresAt());
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public LoginResponse response(User user,RefreshToken session,String refresh,Instant now,Instant sessionExpiry) {
        Instant expiry=now.plusSeconds(properties.accessSeconds());
        if(sessionExpiry.isBefore(expiry))expiry=sessionExpiry;
        String access=jwt.issue(user.getUserId(),session.getSessionId(),now,expiry);
        String photo=photos.findByUserId(user.getUserId()).map(ProfilePhoto::url).orElse(null);
        return new LoginResponse("Bearer",access,Duration.between(now,expiry).getSeconds(),refresh,
            Duration.between(now,sessionExpiry).getSeconds(),
            new LoginUserResponse(user.getUserId().toString(),user.getEmail(),user.getNickname(),photo));
    }
}
