package com.f106.DIO.diary.creation;

/** 인증 담당이 검증한 현재 회원. 생성 요청의 owner/userId를 신뢰하는 구현은 사용하지 않는다. */
public interface DiaryCreationIdentity {
	long requireUserId();
}
