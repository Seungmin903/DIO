package com.f106.DIO.sharing.controller;
import com.f106.DIO.sharing.dto.EmailInvitePageResponse;
import com.f106.DIO.sharing.service.EmailInviteService;
import com.f106.DIO.sharing.support.SharingActor;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/me/invites")
@SecurityRequirement(name="bearerAuth")
@io.swagger.v3.oas.annotations.tags.Tag(name="공유 다이어리")
public class MyInviteController {
    private final EmailInviteService service;
    public MyInviteController(EmailInviteService service){this.service=service;}
    @GetMapping @Operation(summary="내가 받은 이메일 초대 목록")
    public EmailInvitePageResponse list(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return service.received(SharingActor.require(jwt),page,size);}
    @PostMapping("/{inviteId}/decline") @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary="받은 이메일 초대 거절")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="204",description="거절 완료")
    public void decline(@PathVariable long inviteId,@AuthenticationPrincipal Jwt jwt){service.decline(inviteId,SharingActor.require(jwt));}
}
