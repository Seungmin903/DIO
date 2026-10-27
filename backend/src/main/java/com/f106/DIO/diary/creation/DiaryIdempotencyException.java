package com.f106.DIO.diary.creation;

import org.springframework.http.HttpStatus;

public class DiaryIdempotencyException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    public DiaryIdempotencyException(HttpStatus status,String code,String message) { super(message); this.status=status; this.code=code; }
    public HttpStatus status() { return status; }
    public String code() { return code; }
    static DiaryIdempotencyException invalid(String code) { return new DiaryIdempotencyException(HttpStatus.BAD_REQUEST,code,"생성 요청의 중복 방지 키를 확인해 주세요."); }
    static DiaryIdempotencyException conflict() { return new DiaryIdempotencyException(HttpStatus.CONFLICT,"IDEMPOTENCY_KEY_REUSED","다른 생성 내용에 사용한 키예요. 새 작업에는 새 키를 사용해 주세요."); }
    static DiaryIdempotencyException pending() { return new DiaryIdempotencyException(HttpStatus.CONFLICT,"IDEMPOTENCY_IN_PROGRESS","같은 생성 요청을 처리 중이에요. 같은 키로 잠시 후 다시 확인해 주세요."); }
    static DiaryIdempotencyException unavailable() { return new DiaryIdempotencyException(HttpStatus.CONFLICT,"IDEMPOTENCY_RESULT_UNAVAILABLE","기존 생성 결과를 현재 상태에서 반환할 수 없어요. 보관함에서 확인해 주세요."); }
}
