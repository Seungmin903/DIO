package com.f106.DIO.page.support;
/** 서버 속지 목록(page_templates) 자체가 잘못된 경우. 같은 코드 · 버전의 활성 행이 여럿이면 어느 속지인지 정할 수 없다(사용자 요청 오류가 아니다) */
public class PageTemplateCatalogException extends RuntimeException {
    private final String templateCode, templateVersion;
    private final int activeRows;
    public PageTemplateCatalogException(String templateCode,String templateVersion,int activeRows){
        super("서버의 속지 목록을 확인하고 있어요. 잠시 뒤 다시 시도해 주세요.");
        this.templateCode=templateCode;this.templateVersion=templateVersion;this.activeRows=activeRows;
    }
    public String templateCode(){return templateCode;}
    public String templateVersion(){return templateVersion;}
    public int activeRows(){return activeRows;}
}
