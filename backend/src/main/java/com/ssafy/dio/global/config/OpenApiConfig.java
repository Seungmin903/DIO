package com.ssafy.dio.global.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

	@Bean
	public OpenAPI dioOpenApi() {
		return new OpenAPI().info(new Info()
			.title("DIO 비회원 MVP1 API")
			.version("mvp1-development")
			.description("비회원 다이어리 API이며 인증 토큰은 필요 없습니다. 생성은 201, 목록·상세·수정은 200, 삭제는 본문 없이 204입니다. "
				+ "상세·수정·삭제의 없는 ID는 404, 잘못된 요청은 400입니다."));
	}
}
