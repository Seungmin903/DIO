package com.f106.DIO.notification.controller;

import java.security.Principal;
import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import com.f106.DIO.notification.service.NotificationMutationService;
import com.f106.DIO.notification.service.NotificationMutationService.PreparedRead;

/** 기존 전체 읽음 경로/정책을 유지하고 기본 알림 Controller의 의존성에서 분리한다. */
@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationReadAllController {
    private final NotificationMutationService mutations;

    public NotificationReadAllController(NotificationMutationService mutations) { this.mutations = mutations; }

    @PostMapping("/read-watermarks")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "전체 읽음 대상 확정", description = "본인 전체 미읽음 알림을 고정해 10분간 유효한 readWatermark를 발급. 244 합의 전 제안 계약.")
    public PreparedRead prepareReadAll(@Parameter(hidden = true) Principal principal) {
        return mutations.prepareReadAll(NotificationController.userId(principal));
    }

    @PostMapping("/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "고정한 알림 전체 읽음", description = "준비 응답의 readWatermark를 그대로 재사용. 새로 도착한 알림 제외. 만료는 410, 잘못된/타인 경계는 400.")
    public void readAll(@Parameter(hidden = true) Principal principal, @Valid @RequestBody ReadAllRequest request) {
        mutations.readAll(NotificationController.userId(principal), request.readWatermark());
    }

    public record ReadAllRequest(@NotNull UUID readWatermark) {}
}
