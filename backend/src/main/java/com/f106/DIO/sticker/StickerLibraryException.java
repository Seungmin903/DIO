package com.f106.DIO.sticker;

import org.springframework.http.HttpStatus;

public class StickerLibraryException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    public StickerLibraryException(HttpStatus status, String code, String message) { super(message); this.status = status; this.code = code; }
    public HttpStatus status() { return status; }
    public String code() { return code; }
    static StickerLibraryException invalid(String message) { return new StickerLibraryException(HttpStatus.BAD_REQUEST, "INVALID_STICKER_LIBRARY", message); }
    static StickerLibraryException conflict() { return new StickerLibraryException(HttpStatus.CONFLICT, "STICKER_LIBRARY_CONFLICT", "다른 기기에서 보관함이 바뀌었습니다. 다시 불러온 뒤 저장해 주세요."); }
    static StickerLibraryException media() { return new StickerLibraryException(HttpStatus.BAD_REQUEST, "STICKER_MEDIA_NOT_FOUND", "보관함에 넣을 수 없는 이미지가 있습니다."); }
}
