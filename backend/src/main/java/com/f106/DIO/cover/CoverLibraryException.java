package com.f106.DIO.cover;

import org.springframework.http.HttpStatus;

public class CoverLibraryException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    public CoverLibraryException(HttpStatus status, String code, String message) { super(message); this.status = status; this.code = code; }
    public HttpStatus status() { return status; }
    public String code() { return code; }
    static CoverLibraryException invalid(String message) { return new CoverLibraryException(HttpStatus.BAD_REQUEST, "INVALID_COVER_LIBRARY", message); }
    static CoverLibraryException conflict() { return new CoverLibraryException(HttpStatus.CONFLICT, "COVER_LIBRARY_CONFLICT", "다른 기기에서 내 표지 보관함이 바뀌었습니다. 다시 불러온 뒤 저장해 주세요."); }
    static CoverLibraryException media() { return new CoverLibraryException(HttpStatus.BAD_REQUEST, "COVER_MEDIA_NOT_FOUND", "보관함에 넣을 수 없는 표지 그림이 있습니다."); }
}
