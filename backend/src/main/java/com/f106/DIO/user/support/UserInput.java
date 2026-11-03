package com.f106.DIO.user.support;
import java.text.Normalizer;
import java.util.Locale;
public final class UserInput {
    private UserInput() {}
    /** All email request DTOs match frontend/src/shared/emailInput.js. */
    public static final String EMAIL_PATTERN = "(?=.{1,64}@)[\\p{L}\\p{M}\\p{N}!#$%&'*+/=?^_`{|}~-]+(?:\\.[\\p{L}\\p{M}\\p{N}!#$%&'*+/=?^_`{|}~-]+)*@(?:[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]{0,61}[\\p{L}\\p{N}])?\\.)+[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]{0,61}[\\p{L}\\p{N}])?";
    private static final java.util.regex.Pattern EDGE_WHITESPACE = java.util.regex.Pattern.compile("^[\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+|[\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+$");
    public static String normalizeEmail(String value) { return value == null ? null : EDGE_WHITESPACE.matcher(value).replaceAll("").toLowerCase(Locale.ROOT); }
    public static String normalizeNickname(String value) {
        return value == null ? null : Normalizer.normalize(value.strip(), Normalizer.Form.NFKC);
    }
}
