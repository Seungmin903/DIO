package com.f106.DIO.page.dto;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;

/** 자동 저장을 위한 원자적 요소 일괄 변경 요청. 네 배열 중 하나 이상이 필요하다. */
public record CanvasElementBatchRequest(
	List<@Valid CanvasElementCreateRequest> creates,
	List<@Valid CanvasElementUpdateRequest> updates,
	List<UUID> deleteElementIds,
	List<UUID> restoreElementIds
) {
	@AssertTrue(message = "일괄 변경할 요소가 하나 이상 필요합니다.")
	public boolean isNotEmpty() {
		return !(isEmpty(creates) && isEmpty(updates) && isEmpty(deleteElementIds) && isEmpty(restoreElementIds));
	}

	private static boolean isEmpty(List<?> values) {
		return values == null || values.isEmpty();
	}
}
