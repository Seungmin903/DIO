package com.f106.DIO.sharing.config;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;
@Configuration(proxyBeanMethods=false)
public class SharingSecurityConfig {
    @Bean @Order(5)
    public SecurityFilterChain sharingSecurity(HttpSecurity http,@Qualifier("loginJwtDecoder") JwtDecoder decoder,
            @Qualifier("loginBearerTokenResolver") BearerTokenResolver resolver) throws Exception {
        // Match only sharing endpoints; leave existing diary routes to their owning domain.
        return http.securityMatcher(request -> {
            String path=request.getRequestURI().substring(request.getContextPath().length());
            return path.matches("/api/v1/diaries/[^/]+/(profile|members(?:/[^/]+(?:/profile-photo)?)?|transfer-owner|invites(?:/[^/]+)?)")
                ||path.matches("/api/v1/invites/[^/]+(?:/accept)?")
                ||path.matches("/api/v1/me/invites(?:/[^/]+/decline)?");
        }).cors(org.springframework.security.config.Customizer.withDefaults())
            .csrf(c -> c.disable()).formLogin(c -> c.disable()).httpBasic(c -> c.disable()).logout(c -> c.disable())
            .requestCache(c -> c.disable()).sessionManagement(c -> c.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(c -> c.requestMatchers(org.springframework.http.HttpMethod.OPTIONS,"/**").permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.GET,"/api/v1/invites/{token}").permitAll().anyRequest().authenticated())
            .oauth2ResourceServer(c -> c.bearerTokenResolver(resolver).jwt(j -> j.decoder(decoder))
                .authenticationEntryPoint((request,response,error) -> {
                    response.setStatus(401);response.setContentType("application/problem+json;charset=UTF-8");
                    response.setHeader("Cache-Control","no-store");response.setHeader("WWW-Authenticate","Bearer");
                    response.getWriter().write("{\"status\":401,\"title\":\"Unauthorized\",\"code\":\"INVALID_TOKEN\",\"detail\":\"다시 로그인해 주세요.\"}");
                })).build();
    }
}
