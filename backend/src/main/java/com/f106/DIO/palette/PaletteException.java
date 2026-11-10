package com.f106.DIO.palette;

import org.springframework.http.HttpStatus;

public class PaletteException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    public PaletteException(HttpStatus status, String code, String message) { super(message); this.status = status; this.code = code; }
    public HttpStatus status() { return status; }
    public String code() { return code; }
    static PaletteException invalid(String message) { return new PaletteException(HttpStatus.BAD_REQUEST, "INVALID_PALETTE", message); }
    static PaletteException conflict() { return new PaletteException(HttpStatus.CONFLICT, "PALETTE_CONFLICT", "다른 기기에서 팔레트가 바뀌었습니다. 다시 불러온 뒤 저장해 주세요."); }
}
