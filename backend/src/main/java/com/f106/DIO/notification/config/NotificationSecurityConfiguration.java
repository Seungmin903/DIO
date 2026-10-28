package com.f106.DIO.notification.config;

import java.util.List;
import java.util.Map;
import com.f106.DIO.notification.auth.NotificationUserPrincipal;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;

/** 로그인 모듈의 서명·만료·활성 세션·회원 상태 검증을 그대로 재사용한다. */
@Configuration(proxyBeanMethods = false)
public class NotificationSecurityConfiguration {
    @Bean @Order(0)
    SecurityFilterChain notificationSecurity(HttpSecurity http, JwtDecoder loginJwtDecoder,
            BearerTokenResolver loginBearerTokenResolver) throws Exception {
        var json = tools.jackson.databind.json.JsonMapper.builder().build();
        return http.securityMatcher("/api/v1/notifications", "/api/v1/notifications/**")
            .cors(org.springframework.security.config.Customizer.withDefaults())
            .csrf(csrf -> csrf.disable()).formLogin(form -> form.disable()).httpBasic(basic -> basic.disable())
            .logout(logout -> logout.disable()).requestCache(cache -> cache.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
            .oauth2ResourceServer(oauth -> oauth.bearerTokenResolver(loginBearerTokenResolver)
                .jwt(jwt -> jwt.decoder(loginJwtDecoder).jwtAuthenticationConverter(VerifiedNotificationAuthentication::new))
                .authenticationEntryPoint((request, response, error) -> {
                    response.setStatus(401); response.setContentType("application/problem+json;charset=UTF-8");
                    response.setHeader("Cache-Control", "no-store"); response.setHeader("WWW-Authenticate", "Bearer");
                    response.getWriter().write(json.writeValueAsString(Map.of("status", 401, "title", "Unauthorized",
                        "code", "AUTHENTICATION_REQUIRED", "detail", "다시 로그인해 주세요.", "instance", request.getRequestURI())));
                })).build();
    }
    private static final class VerifiedNotificationAuthentication extends JwtAuthenticationToken implements NotificationUserPrincipal {
        VerifiedNotificationAuthentication(Jwt jwt) { super(jwt, List.of(), jwt.getSubject()); }
        @Override public long userId() { return Long.parseLong(getToken().getSubject()); }
    }
}
