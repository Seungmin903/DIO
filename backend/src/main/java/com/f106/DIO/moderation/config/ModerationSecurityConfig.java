package com.f106.DIO.moderation.config;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;
@Configuration(proxyBeanMethods=false)
public class ModerationSecurityConfig {
    // Collaboration's WebSocket chain uses order 4; keep the moderation HTTP chain distinct.
    @Bean @Order(6)
    public SecurityFilterChain moderationSecurity(HttpSecurity http,@Qualifier("loginJwtDecoder") JwtDecoder decoder,
            @Qualifier("loginBearerTokenResolver") BearerTokenResolver resolver) throws Exception {
        // Own only moderation routes; preserve existing security chains.
        var paths=org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher.withDefaults();
        var matcher=new org.springframework.security.web.util.matcher.OrRequestMatcher(java.util.stream.Stream.of("/api/v1/reports","/api/v1/me/blocks","/api/v1/me/blocks/{userId}").map(paths::matcher).map(m->(org.springframework.security.web.util.matcher.RequestMatcher)m).toList());
        return http.securityMatcher(matcher).cors(org.springframework.security.config.Customizer.withDefaults())
            .csrf(c -> c.disable()).formLogin(c -> c.disable()).httpBasic(c -> c.disable()).logout(c -> c.disable())
            .requestCache(c -> c.disable()).sessionManagement(c -> c.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(c -> c.requestMatchers(org.springframework.http.HttpMethod.OPTIONS,"/**").permitAll()
                .anyRequest().authenticated())
            .oauth2ResourceServer(c -> c.bearerTokenResolver(resolver).jwt(j -> j.decoder(decoder))
                .authenticationEntryPoint((request,response,error) -> {
                    response.setStatus(401);response.setContentType("application/problem+json;charset=UTF-8");
                    response.setHeader("Cache-Control","no-store");response.setHeader("WWW-Authenticate","Bearer");
                    response.getWriter().write("{\"status\":401,\"title\":\"Unauthorized\",\"code\":\"INVALID_TOKEN\",\"detail\":\"다시 로그인해 주세요.\"}");
                })).build();
    }
}
