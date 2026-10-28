package com.f106.DIO.page.support;
/** 미디어 소유권 검증이 생기기 전까지 외부 미디어 UUID 연결을 막는다. */
public class MediaFileNotSupportedException extends RuntimeException { public MediaFileNotSupportedException(){super("미디어 연결은 아직 지원하지 않습니다. mediaFileId 없이 요청해 주세요.");} }
