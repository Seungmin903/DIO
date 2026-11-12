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
			.description("이메일 인증 기반 일반 회원가입·로그인 API입니다. "
				+ "회원 다이어리 7개·페이지·캔버스 저장 API와 로그아웃에는 Bearer Access Token이 필요합니다. "
				+ "다이어리는 소유자와 참여 멤버만 조회할 수 있고 OWNER·EDITOR만 저장 내용을 변경할 수 있습니다."));
	}
}
