package com.f106.DIO.page.support;
public class CanvasElementVersionConflictException extends RuntimeException { public CanvasElementVersionConflictException(){super("다른 사용자의 변경이 먼저 저장되었습니다. 최신 내용을 조회한 뒤 다시 시도해 주세요.");} }
