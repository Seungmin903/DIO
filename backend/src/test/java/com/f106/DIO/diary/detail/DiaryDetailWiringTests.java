package com.f106.DIO.diary.detail;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
class DiaryDetailWiringTests {
	@Autowired DiaryDetailService service;
	@Test
	void theSpringServiceIsTransactionalAndRejectsCallsWithoutAnAuthenticatedRequest() {
		assertThat(org.springframework.aop.support.AopUtils.isAopProxy(service)).isTrue();
		assertThatThrownBy(() -> service.get(UUID.randomUUID())).isInstanceOfSatisfying(DiaryDetailException.class,
			e -> assertThat(e.code()).isEqualTo("DIARY_AUTHENTICATION_REQUIRED"));
	}
}
