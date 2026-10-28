package com.f106.DIO.diary.creation;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import com.f106.DIO.diary.dto.DiaryCreateRequest;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest @ActiveProfiles("test")
class MemberDiaryCreationWiringTests {
	@Autowired MemberDiaryCreationService service;
	@Autowired DiaryInitialPages pages;
	@Test void rejectsUnauthenticatedCreationThroughTheTransactionalSpringBean() {
		assertThat(org.springframework.aop.support.AopUtils.isAopProxy(service)).isTrue();
		assertThat(pages).isInstanceOf(JdbcDiaryInitialPages.class);
		assertThatThrownBy(() -> service.create(new DiaryCreateRequest("diary",null,null,null),List.of(new DiaryInitialPages.Selection("BLANK","1","{}")))).isInstanceOfSatisfying(DiaryCreationException.class,
			e -> assertThat(e.code()).isEqualTo("DIARY_CREATION_AUTHENTICATION_REQUIRED"));
	}
}
