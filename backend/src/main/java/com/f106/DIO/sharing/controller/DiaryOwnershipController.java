package com.f106.DIO.sharing.controller;
import com.f106.DIO.sharing.dto.OwnershipTransferRequest;
import com.f106.DIO.sharing.service.DiaryOwnershipService;
import com.f106.DIO.sharing.support.SharingActor;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/diaries/{diaryId}/transfer-owner")
@SecurityRequirement(name="bearerAuth")
@io.swagger.v3.oas.annotations.tags.Tag(name="공유 다이어리")
public class DiaryOwnershipController {
    private final DiaryOwnershipService ownership;
    public DiaryOwnershipController(DiaryOwnershipService ownership){this.ownership=ownership;}
    @PostMapping @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary="소유권 양도",description="현재 소유자만 가능. 기존 소유자는 편집자로 남으며 나가려면 별도 DELETE members API 호출.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="204",description="소유권 양도 완료")
    public void transfer(@PathVariable UUID diaryId,@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody OwnershipTransferRequest request){ownership.transfer(diaryId,SharingActor.require(jwt),request.newOwnerUserId());}
}
