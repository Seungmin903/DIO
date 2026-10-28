package com.f106.DIO.diary.detail;

/** 인증 담당이 검증한 현재 회원만 제공한다. 요청 userId·역할 문자열을 직접 사용하지 않는다. */
public interface DiaryDetailIdentity {
	long requireUserId();
}
