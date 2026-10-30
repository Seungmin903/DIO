package com.f106.DIO.page.support;
public class PageCreationConflictException extends RuntimeException {
    public PageCreationConflictException(){super("기존 페이지 생성 요청과 내용이 다르거나 이미 삭제된 페이지입니다. 목록을 다시 확인해 주세요.");}
}
