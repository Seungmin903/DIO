package com.f106.DIO.moderation.controller;

import com.f106.DIO.moderation.service.BlockWarningDismissalService;
import com.f106.DIO.sharing.support.SharingActor;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me/block-warning-dismissals/{diaryId}")
public class BlockWarningDismissalController {
    private final BlockWarningDismissalService service;

    public BlockWarningDismissalController(BlockWarningDismissalService service) {
        this.service = service;
    }

    public record DismissalRequest(List<Long> userIds) {}
    public record DismissalResponse(List<String> userIds) {}

    @GetMapping
    public ResponseEntity<DismissalResponse> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID diaryId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(new DismissalResponse(service.list(SharingActor.require(jwt), diaryId)));
    }

    @PutMapping
    public ResponseEntity<Void> dismiss(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID diaryId,
            @RequestBody DismissalRequest request) {
        service.dismiss(SharingActor.require(jwt), diaryId, request.userIds());
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}
