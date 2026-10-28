package com.f106.DIO.diary.auth;

import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** 현재 요청에서 로그인 필터가 검증한 JWT를 재사용하며, 필터 밖에서는 직접 검증한다. */
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
            // 로그인 필터는 서명/issuer/audience/token_use/만료와 활성 사용자·세션을 검증한다.
            // 현재 요청의 실제 Bearer와 일치하는 인증 완료 JWT만 재사용한다.
            // 일반 principal, 미인증 JWT, 다른 요청의 토큰은 이 경로로 신뢰하지 않는다.
            var authentication = SecurityContextHolder.getContext().getAuthentication();
            String subject = authentication instanceof JwtAuthenticationToken jwt && jwt.isAuthenticated()
                    && token.equals(jwt.getToken().getTokenValue())
                ? jwt.getToken().getSubject() : decoder.decode(token).getSubject();
            if (subject == null || !subject.matches("[1-9][0-9]{0,18}")) throw unauthorized.get();
            return Long.parseLong(subject);
        } catch (JwtException | OAuth2AuthenticationException | NumberFormatException invalid) {
            throw unauthorized.get();
        }
    }
}
