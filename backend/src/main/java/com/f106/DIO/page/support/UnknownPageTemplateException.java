package com.f106.DIO.page.support;
/** 앱이 보낸 속지 코드 · 버전의 활성 행이 서버에 없다(오타 · 서버에 아직 없는 새 속지 · 내린 속지). 앱 업데이트로 풀릴 수 있는 경우라 다른 400과 구분한다 */
public class UnknownPageTemplateException extends RuntimeException {
    public UnknownPageTemplateException(){super("없는 속지 코드 · 버전이에요.");}
}
