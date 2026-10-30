package com.f106.DIO.media.support;

import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
public class MediaWebConfiguration implements WebMvcConfigurer {
    private final String[] origins;
    public MediaWebConfiguration(@Value("${AUTH_ALLOWED_ORIGINS:http://localhost:8081,http://127.0.0.1:8081}") String value) {
        origins = Arrays.stream(value.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toArray(String[]::new);
    }
    @Override public void addCorsMappings(CorsRegistry registry) {
        for (String path : new String[] {"/api/v1/media", "/api/v1/media/**"}) {
            registry.addMapping(path).allowedOrigins(origins).allowedMethods("GET", "POST", "DELETE", "OPTIONS")
                .allowedHeaders("Authorization", "X-DIO-Access-Token", "Content-Type").exposedHeaders("Location", "Retry-After")
                .allowCredentials(false).maxAge(600);
        }
    }
}
