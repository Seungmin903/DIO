package com.f106.DIO.page.dto;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
public record CanvasElementBatchRequest(
	@Size(max=100) List<@NotNull @Valid CanvasElementCreateRequest> creates,
	@Size(max=100) List<@NotNull @Valid CanvasElementUpdateRequest> updates,
	@Size(max=100) List<@NotNull UUID> deleteElementIds,
	@Size(max=100) List<@NotNull UUID> restoreElementIds) {
	@AssertTrue(message="일괄 변경할 요소가 하나 이상 필요해요.") public boolean isNotEmpty(){return !(empty(creates)&&empty(updates)&&empty(deleteElementIds)&&empty(restoreElementIds));}
	@AssertTrue(message="일괄 변경의 propertiesJson 합계는 4MiB 이하여야 해요.") public boolean isPropertiesPayloadSizeValid(){return propertiesBytes(creates)+propertiesBytes(updates)<=4*1024*1024;}
	private static boolean empty(List<?> values){return values==null||values.isEmpty();}
	private static long propertiesBytes(List<?> values){
		if(values==null)return 0;
		return values.stream().filter(Objects::nonNull).mapToLong(value->value instanceof CanvasElementCreateRequest create?JsonPayloadLimits.bytes(create.getPropertiesJson()):JsonPayloadLimits.bytes(((CanvasElementUpdateRequest)value).getPropertiesJson())).sum();
	}
}
