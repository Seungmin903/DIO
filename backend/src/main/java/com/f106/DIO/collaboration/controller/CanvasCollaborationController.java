package com.f106.DIO.collaboration.controller;
import com.f106.DIO.collaboration.dto.*;
import com.f106.DIO.collaboration.service.CanvasOperationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/pages/{pageId}")
@Tag(name="공동 편집",description="본인 작업 이력·실행 취소·다시 실행. 실시간 연결은 /ws/diaries/{diaryId}")
@SecurityRequirement(name="bearerAuth")
public class CanvasCollaborationController {
    private final CanvasOperationService service;
    public CanvasCollaborationController(CanvasOperationService service){this.service=service;}
    @PostMapping("/canvas-operations") @Operation(summary="캔버스 작업 반영",description="clientOperationId로 중복 반영을 방지합니다. 생성 ID 및 삭제·복구 대상의 expectedVersions는 필수입니다. 요소 변경과 이력이 함께 커밋됩니다.")
    public CanvasOperationResponse apply(@PathVariable UUID pageId,@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody CanvasOperationRequest request){return service.apply(pageId,Long.parseLong(jwt.getSubject()),request);}
    @PostMapping("/undo") @Operation(summary="내 작업 실행 취소",description="현재 페이지의 마지막 적용 작업만 취소합니다. 다른 변경과 겹치면 전체 409. history/me의 nextUndo와 새 clientOperationId를 전달합니다.")
    public CanvasOperationResponse undo(@PathVariable UUID pageId,@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody CanvasHistoryCommand request){return service.transition(pageId,Long.parseLong(jwt.getSubject()),request,true);}
    @PostMapping("/redo") @Operation(summary="내 작업 다시 실행",description="history/me의 nextRedo와 새 clientOperationId를 전달합니다. 중복 요청과 오래된 revision으로 다른 작업을 실행하지 않습니다.")
    public CanvasOperationResponse redo(@PathVariable UUID pageId,@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody CanvasHistoryCommand request){return service.transition(pageId,Long.parseLong(jwt.getSubject()),request,false);}
    @GetMapping("/history/me") @Operation(summary="내 작업 이력",description="현재 참여 중인 페이지의 본인 작업만 조회합니다. nextUndo/nextRedo는 후보이며 충돌 여부는 실행 시 검사합니다.")
    public CanvasHistoryPage history(@PathVariable UUID pageId,@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return service.history(pageId,Long.parseLong(jwt.getSubject()),page,size);}
}
