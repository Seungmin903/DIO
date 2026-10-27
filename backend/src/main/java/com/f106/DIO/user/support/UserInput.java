package com.f106.DIO.user.support;
import java.text.Normalizer;
import java.util.Locale;
public final class UserInput {
    private UserInput() {}
    public static String normalizeEmail(String value) { return value == null ? null : value.strip().toLowerCase(Locale.ROOT); }
    public static String normalizeNickname(String value) {
        return value == null ? null : Normalizer.normalize(value.strip(), Normalizer.Form.NFKC);
    }
}
