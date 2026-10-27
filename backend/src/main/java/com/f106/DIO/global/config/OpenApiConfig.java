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
			.description("비회원 다이어리 CRUD, 회원 다이어리 생성·상세·수정, 이메일 인증 기반 회원가입·로그인 API입니다. "
				+ "로그아웃과 /api/v1/member/diaries에는 Bearer Access Token이 필요합니다. "
				+ "기존 공개 /api/v1/diaries는 회원 소유자가 없는 자료만 조회·수정·삭제합니다. 소셜로그인과 회원 목록·휴지통은 별도 통합 범위입니다."));
	}
}
