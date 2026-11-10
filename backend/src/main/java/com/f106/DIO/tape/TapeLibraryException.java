package com.f106.DIO.tape;

import org.springframework.http.HttpStatus;

public class TapeLibraryException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    public TapeLibraryException(HttpStatus status, String code, String message) { super(message); this.status = status; this.code = code; }
    public HttpStatus status() { return status; }
    public String code() { return code; }
    static TapeLibraryException invalid(String message) { return new TapeLibraryException(HttpStatus.BAD_REQUEST, "INVALID_TAPE_LIBRARY", message); }
    static TapeLibraryException conflict() { return new TapeLibraryException(HttpStatus.CONFLICT, "TAPE_LIBRARY_CONFLICT", "다른 기기에서 테이프 보관함이 바뀌었습니다. 다시 불러온 뒤 저장해 주세요."); }
    static TapeLibraryException media() { return new TapeLibraryException(HttpStatus.BAD_REQUEST, "TAPE_MEDIA_NOT_FOUND", "보관함에 넣을 수 없는 테이프 사진이 있습니다."); }
}
