package com.f106.DIO.sharing.controller;
import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.domain.DiaryMemberId;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.sharing.dto.*;
import com.f106.DIO.sharing.service.DiaryMembershipService;
import com.f106.DIO.sharing.support.SharingActor;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
@io.swagger.v3.oas.annotations.tags.Tag(name="공유 다이어리",description="멤버 관리 및 초대 링크 API")
@RestController
@RequestMapping("/api/v1/diaries/{diaryId}")
@SecurityRequirement(name="bearerAuth")
public class DiaryMembershipController {
    private final DiaryMembershipService service;
    public DiaryMembershipController(DiaryMembershipService service){this.service=service;}
    @GetMapping("/members") @Operation(summary="공유 다이어리 멤버 목록")
    public MemberListResponse list(@PathVariable UUID diaryId,@AuthenticationPrincipal Jwt jwt){return service.list(diaryId,SharingActor.require(jwt));}
    @DeleteMapping("/members/{userId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary="멤버 내보내기·나가기",description="본인 나가기, 소유자만 다른 멤버 강퇴. 마지막 멤버 나가기는 다이어리 영구 삭제.")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="204",description="처리 완료")
    public void remove(@PathVariable UUID diaryId,@PathVariable long userId,@AuthenticationPrincipal Jwt jwt){service.remove(diaryId,SharingActor.require(jwt),userId);}
}
