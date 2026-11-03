package com.f106.DIO.auth.config;

import com.f106.DIO.auth.exception.LoginException;
import com.f106.DIO.auth.security.LoginJwt;
import com.f106.DIO.auth.service.EmailLoginService;

import org.springframework.context.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;

@Configuration(proxyBeanMethods = false)
public class LoginSecurityConfig {
    @Bean
    public BearerTokenResolver loginBearerTokenResolver(@Value("${dio.auth.development-token-header:}") String header) {
        var standard = new DefaultBearerTokenResolver();
        if (header.isBlank()) return standard;
        if (!"X-DIO-Access-Token".equals(header)) throw new IllegalArgumentException("Unsupported development token header");
        // Nginx Basic 인증은 Authorization을 사용한다. 개발 전용 보조 헤더도 동일한 JWT 검증을 거친다.
        return request -> {
            String bearer = standard.resolve(request);
            String development = request.getHeader(header);
            return bearer != null ? bearer : development == null || development.isBlank() ? null : development.strip();
        };
    }
    @Bean
    public JwtDecoder loginJwtDecoder(LoginJwt tokens, EmailLoginService service) {
        return encoded -> {
            Jwt jwt;
            try { jwt = tokens.decode(encoded); }
            catch (LoginException error) { throw new BadJwtException("JWT verifier unavailable"); }
            if (!service.active(jwt)) throw new BadJwtException("Inactive login session");
            return jwt;
        };
    }
    @Bean
    public SecurityFilterChain loginSecurity(HttpSecurity http, JwtDecoder loginJwtDecoder, BearerTokenResolver loginBearerTokenResolver) throws Exception {
        return http.securityMatcher("/api/v1/me", "/api/v1/me/password", "/api/v1/me/terms", "/api/v1/me/terms/*/*", "/api/v1/auth/logout", "/api/v1/diaries", "/api/v1/diaries/**", "/api/v1/pages/**", "/api/v1/media/**", "/api/v1/sticker-cutouts", "/api/v1/sticker-cutouts/**", "/api/v1/handwriting-fonts", "/api/v1/handwriting-fonts/**", "/api/v1/push/installations", "/api/v1/push/installations/**")
            .cors(org.springframework.security.config.Customizer.withDefaults())
            .csrf(csrf -> csrf.disable()).formLogin(form -> form.disable()).httpBasic(basic -> basic.disable())
            .logout(logout -> logout.disable()).requestCache(cache -> cache.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
            .oauth2ResourceServer(oauth -> oauth.bearerTokenResolver(loginBearerTokenResolver).jwt(jwt -> jwt.decoder(loginJwtDecoder))
                .authenticationEntryPoint((request, response, error) -> {
                    response.setStatus(401); response.setContentType("application/problem+json;charset=UTF-8");
                    response.setHeader("Cache-Control", "no-store"); response.setHeader("WWW-Authenticate", "Bearer");
                    response.getWriter().write("{\"status\":401,\"title\":\"Unauthorized\",\"code\":\"INVALID_TOKEN\",\"detail\":\"다시 로그인해 주세요.\"}");
                })).build();
    }
}
