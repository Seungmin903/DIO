package com.f106.DIO.collaboration.dto;
import com.f106.DIO.page.dto.CanvasElementBatchRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
public record CanvasOperationRequest(@NotNull UUID clientOperationId,@NotNull @Valid CanvasElementBatchRequest changes,
    @Size(max=200) Map<UUID,@NotNull @PositiveOrZero Long> expectedVersions){
    @AssertTrue(message="생성 요소의 elementId와 삭제·복구 요소의 expectedVersions는 필수입니다.")
    public boolean isIdentified(){
        if(changes==null)return true;
        if(changes.creates()!=null&&changes.creates().stream().anyMatch(c->c==null||c.getElementId()==null))return false;
        var versions=expectedVersions==null?Map.<UUID,Long>of():expectedVersions;
        return (changes.deleteElementIds()==null||changes.deleteElementIds().stream().allMatch(versions::containsKey))
            &&(changes.restoreElementIds()==null||changes.restoreElementIds().stream().allMatch(versions::containsKey));
    }
}
