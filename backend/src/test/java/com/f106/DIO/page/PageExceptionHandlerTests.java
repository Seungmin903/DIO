package com.f106.DIO.page;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

import com.f106.DIO.page.domain.CanvasElement;
import com.f106.DIO.page.domain.DiaryPage;
import com.f106.DIO.page.support.PageExceptionHandler;

import static org.assertj.core.api.Assertions.assertThat;

class PageExceptionHandlerTests {

	private final PageExceptionHandler handler = new PageExceptionHandler();

	@Test
	void optimisticLockConflictsAreReportedPerEntity() {
		var page = handler.concurrentModification(new ObjectOptimisticLockingFailureException(DiaryPage.class, UUID.randomUUID()));
		var element = handler.concurrentModification(new ObjectOptimisticLockingFailureException(CanvasElement.class, UUID.randomUUID()));

		assertThat(page.getStatus()).isEqualTo(409);
		assertThat(page.getProperties()).containsEntry("code", "PAGE_VERSION_CONFLICT");
		assertThat(element.getProperties()).containsEntry("code", "CANVAS_ELEMENT_VERSION_CONFLICT");
	}
}
