package com.f106.DIO.cutout.support;

import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** 웹 프론트(Expo web)에서 오리기 API를 부를 수 있게 허용한다. 허용 주소는 다른 기능과 같은 AUTH_ALLOWED_ORIGINS. */
@Configuration(proxyBeanMethods = false)
public class CutoutWebConfiguration implements WebMvcConfigurer {
	private final String[] origins;

	public CutoutWebConfiguration(@Value("${AUTH_ALLOWED_ORIGINS:http://localhost:8081,http://127.0.0.1:8081}") String value) {
		origins = Arrays.stream(value.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toArray(String[]::new);
	}

	@Override
	public void addCorsMappings(CorsRegistry registry) {
		for (String path : new String[] {"/api/v1/sticker-cutouts", "/api/v1/sticker-cutouts/**"}) {
			registry.addMapping(path).allowedOrigins(origins).allowedMethods("POST", "DELETE", "OPTIONS")
				.allowedHeaders("Authorization", "X-DIO-Access-Token", "Content-Type").exposedHeaders("Location", "Retry-After")
				.allowCredentials(false).maxAge(600);
		}
	}
}
