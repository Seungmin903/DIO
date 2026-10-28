package com.f106.DIO.diary.read;

public class DiaryReadException extends RuntimeException {
    public final int status;
    public final String code;
    public DiaryReadException(int status, String code, String message) {
        super(message); this.status = status; this.code = code;
    }
    static DiaryReadException invalid() { return new DiaryReadException(400, "INVALID_QUERY", "조회 조건을 확인해 주세요."); }
    static DiaryReadException cursor() { return new DiaryReadException(400, "INVALID_CURSOR", "목록을 새로고침해 주세요."); }
}
