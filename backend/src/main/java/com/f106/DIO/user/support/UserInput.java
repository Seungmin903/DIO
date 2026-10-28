package com.f106.DIO.user.support;
import java.text.Normalizer;
import java.util.Locale;
public final class UserInput {
    private UserInput() {}
    /** 이메일을 받는 모든 가입 요청이 같은 형식 규칙을 쓴다. 프런트 emailError와 같은 식이다. */
    public static final String EMAIL_PATTERN = "[^\\s@]+@[^\\s@]+\\.[^\\s@]+";
    public static String normalizeEmail(String value) { return value == null ? null : value.strip().toLowerCase(Locale.ROOT); }
    public static String normalizeNickname(String value) {
        return value == null ? null : Normalizer.normalize(value.strip(), Normalizer.Form.NFKC);
    }
}
