package com.f106.DIO.diary.support;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
public final class MemberCursorColors {
    private MemberCursorColors(){}
    public static String choose(Set<String> used){
        String color;
        do {var random=ThreadLocalRandom.current();color=String.format("#%02X%02X%02X",random.nextInt(64,209),random.nextInt(64,209),random.nextInt(64,209));}while(used.contains(color));
        return color;
    }
}
