package com.f106.DIO.notification.controller;

import java.security.Principal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import com.f106.DIO.notification.auth.NotificationUserPrincipal;
import com.f106.DIO.notification.dto.NotificationData;
import com.f106.DIO.notification.dto.NotificationListResponse;
import com.f106.DIO.notification.service.NotificationService;
import com.f106.DIO.notification.service.NotificationDeleteService;
import com.f106.DIO.notification.support.NotificationException;

@RestController
@Tag(name = "알림", description = "본인 알림 목록·미읽음 수·읽음 처리·삭제 API")
@RequestMapping("/api/v1/notifications")
@io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "bearerAuth")
public class NotificationController {

	private final NotificationService service;
	private final NotificationDeleteService deletions;

	public NotificationController(NotificationService service, NotificationDeleteService deletions) {
		this.service = service;
		this.deletions = deletions;
	}

	@GetMapping
	@Operation(summary = "본인 알림 목록 조회", description = "검증된 로그인 JWT의 수신자만 조회. 생성 시각·ID 내림차순, 불투명 커서 사용. 미인증 요청은 401.")
	public NotificationListResponse list(@Parameter(hidden = true) Principal principal, @RequestParam(required = false) String cursor,
		@RequestParam(defaultValue = "20") int limit) {
		return service.list(userId(principal), cursor, limit);
	}

	@GetMapping("/unread-count")
	@Operation(summary = "본인 미읽음 알림 및 유효 초대 수", description = "전체 미읽음과 처리 가능한 미읽음 초대를 구분합니다. 미인증 요청은 401.")
	public UnreadCount unreadCount(@Parameter(hidden = true) Principal principal) { long id = userId(principal); return new UnreadCount(service.unreadCount(id), service.actionableUnreadCount(id)); }

	@PatchMapping("/{notificationId}")
	@Operation(summary = "본인 알림 읽음 처리", description = "반복 호출 시 최초 읽은 시각 유지. 타인·없는·삭제된 알림은 동일한 404. 초대 수락·거절과 별개.")
	public NotificationData markRead(@Parameter(hidden = true) Principal principal, @PathVariable long notificationId) {
		return service.markRead(userId(principal), notificationId);
	}

	@DeleteMapping("/{notificationId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Operation(summary = "본인 알림 삭제", description = "소프트 삭제. 반복 삭제는 204, 타인·없는 알림은 동일한 404. 초대 원본 보존.")
	public void delete(@Parameter(hidden = true) Principal principal, @PathVariable long notificationId) {
		deletions.delete(userId(principal), notificationId);
	}

	static long userId(Principal principal) {
		if (!(principal instanceof NotificationUserPrincipal verified) || verified.userId() <= 0) {
			throw new NotificationException(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "로그인이 필요합니다.");
		}
		return verified.userId();
	}

	@io.swagger.v3.oas.annotations.media.Schema(requiredProperties = {"unreadCount"})
	public record UnreadCount(long unreadCount, Long actionableUnreadCount) {}
}
