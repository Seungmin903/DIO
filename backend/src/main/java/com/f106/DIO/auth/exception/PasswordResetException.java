package com.f106.DIO.auth.exception;



import org.springframework.http.HttpStatus;

public class PasswordResetException extends RuntimeException {
    public final HttpStatus status;
    public final String code;
    public int retryAfter = com.f106.DIO.auth.domain.PasswordResetPolicy.IP_WINDOW_SECONDS;
    public PasswordResetException(HttpStatus status, String code, String message) {
        super(message); this.status = status; this.code = code;
    }
    public static PasswordResetException invalid() {
        return new PasswordResetException(HttpStatus.BAD_REQUEST, "INVALID_PASSWORD_RESET", "인증 정보가 유효하지 않아요. 새 인증번호를 요청해 주세요.");
    }
}
