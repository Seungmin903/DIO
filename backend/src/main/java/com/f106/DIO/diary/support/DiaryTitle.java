package com.f106.DIO.diary.support;

/** Match the UI's ECMAScript String.trim whitespace (including NBSP, figure space, narrow NBSP and BOM). */
public final class DiaryTitle {
    private DiaryTitle() {}
    public static String normalize(String value) {
        if(value==null)return null;
        int start=0,end=value.length();
        while(start<end) {int cp=value.codePointAt(start);if(!space(cp))break;start+=Character.charCount(cp);}
        while(start<end) {int cp=value.codePointBefore(end);if(!space(cp))break;end-=Character.charCount(cp);}
        return value.substring(start,end);
    }
    private static boolean space(int cp) {return Character.isSpaceChar(cp) || cp==0xFEFF || (cp>=0x09 && cp<=0x0D);}
}
