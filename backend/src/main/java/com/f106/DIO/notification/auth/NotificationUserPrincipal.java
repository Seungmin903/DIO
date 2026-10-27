package com.f106.DIO.notification.auth;

import java.security.Principal;

/** 인증 모듈이 검증한 회원 ID만 전달한다. 요청 헤더나 파라미터에서 직접 만들지 않는다. */
public interface NotificationUserPrincipal extends Principal {

	long userId();
}
