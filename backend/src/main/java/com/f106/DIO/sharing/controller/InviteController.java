package com.f106.DIO.sharing.controller;
import com.f106.DIO.sharing.dto.*;
import com.f106.DIO.sharing.service.DiaryInviteService;
import com.f106.DIO.sharing.support.SharingActor;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
@io.swagger.v3.oas.annotations.tags.Tag(name="공유 다이어리",description="멤버 관리 및 초대 링크 API")
@RestController
@RequestMapping("/api/v1/invites/{token}")
public class InviteController {
    private final DiaryInviteService service;
    public InviteController(DiaryInviteService service){this.service=service;}
    @GetMapping @Operation(summary="초대 링크 정보 조회",description="일반 공유 링크는 비로그인 조회 가능. 이메일 초대는 지정된 수신자 로그인 필요.")
    public InvitePreviewResponse preview(@PathVariable String token,@AuthenticationPrincipal Jwt jwt){return service.preview(token,jwt==null?null:SharingActor.require(jwt));}
    public record AcceptRequest(boolean acknowledgeBlockedMembers) {}
    @PostMapping("/accept") @SecurityRequirement(name="bearerAuth")
    @Operation(summary="초대 수락",description="소유자 포함 최대 4명, 편집자로 참여. 이미 참여한 멤버는 중복 추가하지 않음.")
    public InviteAcceptResponse accept(@PathVariable String token,@AuthenticationPrincipal Jwt jwt,@RequestBody(required=false) AcceptRequest request){return service.accept(token,SharingActor.require(jwt),request!=null&&request.acknowledgeBlockedMembers());}
}
