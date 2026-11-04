package com.f106.DIO.moderation.controller;
import com.f106.DIO.moderation.service.BlockService;import com.f106.DIO.moderation.dto.BlockRequest;import com.f106.DIO.sharing.support.SharingActor;
import org.springframework.web.bind.annotation.*;import org.springframework.security.core.annotation.AuthenticationPrincipal;import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.*;import jakarta.validation.Valid;import io.swagger.v3.oas.annotations.Operation;import io.swagger.v3.oas.annotations.security.SecurityRequirement;
@RestController @RequestMapping("/api/v1/me/blocks") @SecurityRequirement(name="bearerAuth")
public class BlockController {
 private final BlockService service;public BlockController(BlockService service){this.service=service;}
 @PutMapping("/{userId}") @Operation(summary="공유 다이어리 멤버 차단",description="기존 참여·권한·작업 유지. 이메일 초대 제한, 링크 참여는 경고 후 허용.")
 public ResponseEntity<Void> block(@AuthenticationPrincipal Jwt jwt,@PathVariable long userId,@Valid @RequestBody BlockRequest r){service.block(SharingActor.require(jwt),userId,r.diaryId());return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();}
 @GetMapping @Operation(summary="내가 차단한 사용자 목록")
 public ResponseEntity<BlockService.Result> list(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(SharingActor.require(jwt),page,size));}
 @DeleteMapping("/{userId}") @Operation(summary="사용자 차단 해제")
 public ResponseEntity<Void> unblock(@AuthenticationPrincipal Jwt jwt,@PathVariable long userId){service.unblock(SharingActor.require(jwt),userId);return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();}
}
