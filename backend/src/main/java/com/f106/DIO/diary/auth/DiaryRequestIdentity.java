package com.f106.DIO.diary.auth;

import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** 기존 로그인 검증기로 현재 HTTP 요청의 토큰과 서버 세션을 매번 확인한다. */
@Component
public class DiaryRequestIdentity {
    private final JwtDecoder decoder;
    private final BearerTokenResolver resolver;

    public DiaryRequestIdentity(@Qualifier("loginJwtDecoder") JwtDecoder decoder,
            @Qualifier("loginBearerTokenResolver") BearerTokenResolver resolver) {
        this.decoder = decoder;
        this.resolver = resolver;
    }

    public long requireUserId(Supplier<? extends RuntimeException> unauthorized) {
        if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes)) {
            throw unauthorized.get();
        }
        try {
            String token = resolver.resolve(attributes.getRequest());
            if (token == null || token.isBlank()) throw unauthorized.get();
            // loginJwtDecoder는 서명/issuer/audience/token_use/만료와 활성 사용자·세션까지 검증한다.
            String subject = decoder.decode(token).getSubject();
            if (subject == null || !subject.matches("[1-9][0-9]{0,18}")) throw unauthorized.get();
            return Long.parseLong(subject);
        } catch (JwtException | OAuth2AuthenticationException | NumberFormatException invalid) {
            throw unauthorized.get();
        }
    }
}
