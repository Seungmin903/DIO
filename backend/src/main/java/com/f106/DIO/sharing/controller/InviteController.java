package com.f106.DIO.sharing.controller;
import com.f106.DIO.sharing.dto.*;
import com.f106.DIO.media.service.MediaService;
import com.f106.DIO.media.support.MediaFileNotFoundException;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
    private final MediaService media;
    public InviteController(DiaryInviteService service, MediaService media) {
        this.service = service;
        this.media = media;
    }
    @GetMapping @Operation(summary="초대 링크 정보 조회",description="일반 공유 링크는 비로그인 조회 가능. 이메일 초대는 지정된 수신자 로그인 필요.")
    public ResponseEntity<InvitePreviewResponse> preview(@PathVariable String token, @AuthenticationPrincipal Jwt jwt) {
        var preview = service.preview(token, jwt == null ? null : SharingActor.require(jwt));
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "private, no-store").body(preview);
    }

    @GetMapping("/cover-media/{mediaId}")
    @Operation(summary="초대 미리보기 표지 이미지 조회", description="유효한 초대의 현재 표지에 사용된 이미지 파일을 조회합니다. 이메일 초대는 지정된 수신자 로그인이 필요합니다.")
    public ResponseEntity<byte[]> coverImage(@PathVariable String token, @PathVariable UUID mediaId,
            @AuthenticationPrincipal Jwt jwt) {
        service.requirePreviewCoverImage(token, jwt == null ? null : SharingActor.require(jwt), mediaId);
        MediaService.DownloadedMedia image;
        try {
            image = media.invitationCoverImage(mediaId);
        } catch (MediaFileNotFoundException missing) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.mimeType()))
            .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
            .header("X-Content-Type-Options", "nosniff")
            .body(image.content());
    }
    public record AcceptRequest(boolean acknowledgeBlockedMembers) {}
    @PostMapping("/accept") @SecurityRequirement(name="bearerAuth")
    @Operation(summary="초대 수락",description="소유자 포함 최대 4명, 편집자로 참여. 이미 참여한 멤버는 중복 추가하지 않음.")
    public InviteAcceptResponse accept(@PathVariable String token,@AuthenticationPrincipal Jwt jwt,@RequestBody(required=false) AcceptRequest request){return service.accept(token,SharingActor.require(jwt),request!=null&&request.acknowledgeBlockedMembers());}
}
