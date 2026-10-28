package com.f106.DIO.sharing.controller;
import com.f106.DIO.sharing.dto.*;
import com.f106.DIO.sharing.service.DiaryInviteService;
import com.f106.DIO.sharing.support.SharingActor;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
@io.swagger.v3.oas.annotations.tags.Tag(name="공유 다이어리",description="멤버 관리 및 초대 링크 API")
@RestController
@RequestMapping("/api/v1/diaries/{diaryId}/invites")
@SecurityRequirement(name="bearerAuth")
public class DiaryInviteController {
    private final DiaryInviteService service;
    private final com.f106.DIO.sharing.service.EmailInviteService emails;
    public DiaryInviteController(DiaryInviteService service,com.f106.DIO.sharing.service.EmailInviteService emails){this.service=service;this.emails=emails;}
    @GetMapping @Operation(summary="현재 링크·보낸 이메일 초대 조회")
    public DiaryInvitationsResponse current(@PathVariable UUID diaryId,@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return emails.sent(diaryId,SharingActor.require(jwt),page,size);}
    @PostMapping("/email") @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(summary="이메일 초대 발송",description="가입된 활성 회원에게만 발송. 대기 중 중복 발송 없음. 자동 만료 없음. 서버별 다이어리·정규화 이메일 요청은 가입 여부와 무관하게 5분 3회이며 중복 요청도 포함. 실제 발송 생성은 DB에서도 다이어리·수신자 기준 5분 3회 제한. 결과는 202 공통 안내, 메일은 커밋 후 비동기 전송.")
    public EmailInviteAcknowledgement email(@PathVariable UUID diaryId,@AuthenticationPrincipal Jwt jwt,@jakarta.validation.Valid @RequestBody EmailInviteRequest request){return emails.send(diaryId,SharingActor.require(jwt),request);}
    @DeleteMapping("/{inviteId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary="보낸 초대 취소",description="소유자·편집자 모두 가능. 기존 참여에는 영향 없음.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="204",description="취소 완료")
    public void cancel(@PathVariable UUID diaryId,@PathVariable long inviteId,@AuthenticationPrincipal Jwt jwt){emails.cancel(diaryId,SharingActor.require(jwt),inviteId);}
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary="초대 링크 생성·재생성",description="소유자·편집자 가능. 1시간 유효, 기존 링크 즉시 무효화. 다이어리 전체 기준 5분 3회.")
    public InviteLinkResponse create(@PathVariable UUID diaryId,@AuthenticationPrincipal Jwt jwt){return service.create(diaryId,SharingActor.require(jwt));}
}
