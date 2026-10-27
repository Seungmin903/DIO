package com.f106.DIO.notification.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** MVC 설정을 보안 체인과 분리해 다른 컨트롤러의 WebMvcTest에 로그인 의존성을 요구하지 않는다. */
@Configuration(proxyBeanMethods = false)
public class NotificationCorsConfiguration implements WebMvcConfigurer {
    private final String[] origins;
    public NotificationCorsConfiguration(@Value("${AUTH_ALLOWED_ORIGINS:http://localhost:8081,http://127.0.0.1:8081}") String origins) {
        this.origins = java.util.Arrays.stream(origins.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toArray(String[]::new);
    }
    @Override public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/v1/notifications/**").allowedOrigins(origins)
            .allowedMethods("GET", "PATCH", "DELETE", "OPTIONS")
            .allowedHeaders("Authorization", "X-DIO-Access-Token", "Content-Type")
            .allowCredentials(false).maxAge(600);
    }
}
