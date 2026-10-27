package com.f106.DIO.global.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;

@Configuration
public class OpenApiConfig {

	@Bean
	public OpenAPI dioOpenApi(@Value("${dio.auth.development-token-header:}") String developmentTokenHeader) {
		SecurityScheme authentication = developmentTokenHeader.isBlank()
            ? new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")
            : new SecurityScheme().type(SecurityScheme.Type.APIKEY).in(SecurityScheme.In.HEADER)
                .name(developmentTokenHeader).description("개발 Nginx Basic 인증과 함께 사용합니다. Access Token 값만 입력하세요.");
		return new OpenAPI().components(new Components().addSecuritySchemes("bearerAuth",
            authentication)).info(new Info()
			.title("DIO 개발 API")
			.version("mvp1-development")
			.description("비회원 다이어리 CRUD, 이메일 인증 기반 일반 회원가입·로그인 API입니다. "
				+ "로그아웃에 Bearer Access Token이 필요하며, 기존 다이어리 API는 아직 공개 상태입니다. 소셜로그인·사용자별 다이어리 권한은 별도 구현입니다."));
	}
}
