package com.f106.DIO.moderation.config;

import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Moderation routes only; retain the existing origin allowlist and other domains' CORS rules. */
@Configuration(proxyBeanMethods = false)
public class ModerationCorsConfiguration implements WebMvcConfigurer {
    private final String[] origins;
    public ModerationCorsConfiguration(
            @Value("${AUTH_ALLOWED_ORIGINS:http://localhost:8081,http://127.0.0.1:8081}") String origins) {
        this.origins = Arrays.stream(origins.split(",")).map(String::trim)
            .filter(value -> !value.isEmpty()).toArray(String[]::new);
    }
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        for (String path : new String[]{"/api/v1/reports", "/api/v1/me/blocks", "/api/v1/me/blocks/{userId}",
                "/api/v1/me/block-warning-dismissals/{diaryId}"}) {
            registry.addMapping(path).allowedOrigins(origins)
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("Content-Type", "Authorization", "X-DIO-Access-Token", "Cache-Control")
                .exposedHeaders("Retry-After").allowCredentials(false).maxAge(600);
        }
    }
}
