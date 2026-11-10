package com.f106.DIO.paper;

import org.springframework.http.HttpStatus;

public class PaperLibraryException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    public PaperLibraryException(HttpStatus status, String code, String message) { super(message); this.status = status; this.code = code; }
    public HttpStatus status() { return status; }
    public String code() { return code; }
    static PaperLibraryException invalid(String message) { return new PaperLibraryException(HttpStatus.BAD_REQUEST, "INVALID_PAPER_LIBRARY", message); }
    static PaperLibraryException conflict() { return new PaperLibraryException(HttpStatus.CONFLICT, "PAPER_LIBRARY_CONFLICT", "다른 기기에서 내 속지 보관함이 바뀌었습니다. 다시 불러온 뒤 저장해 주세요."); }
    static PaperLibraryException media() { return new PaperLibraryException(HttpStatus.BAD_REQUEST, "PAPER_MEDIA_NOT_FOUND", "보관함에 넣을 수 없는 속지 그림이 있습니다."); }
}
