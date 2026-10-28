package com.f106.DIO.diary.update;

import com.fasterxml.jackson.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import java.util.Locale;

@Schema(requiredProperties={"expectedVersion"})
public class AccountDiaryUpdateRequest {
    private String diaryTitle, coverColor, coverStyle, expectedVersion;
    @Size(min=1,max=100) @Pattern(regexp="[^\\p{Cntrl}]+")
    public String getDiaryTitle() { return diaryTitle; }
    @Pattern(regexp="#[0-9A-F]{6}")
    public String getCoverColor() { return coverColor; }
    @Pattern(regexp="PLAIN|LINEN|LEATHER|DOT|GINGHAM|STRIPE")
    public String getCoverStyle() { return coverStyle; }
    @NotNull @Schema(type="string", pattern="^[1-9][0-9]{0,18}$", description="양의 BIGINT 문자열")
    public String getExpectedVersion() { return expectedVersion; }
    private static String text(Object value) {
        if (!(value instanceof String s)) throw new IllegalArgumentException("String required");
        return s;
    }
    @JsonSetter(nulls=Nulls.FAIL) public void setDiaryTitle(Object value) { diaryTitle=com.f106.DIO.diary.support.DiaryTitle.normalize(text(value)); }
    @JsonSetter(nulls=Nulls.FAIL) public void setCoverColor(Object value) { coverColor=text(value).toUpperCase(Locale.ROOT); }
    @JsonSetter(nulls=Nulls.FAIL) public void setCoverStyle(Object value) { coverStyle=text(value); }
    @JsonSetter(nulls=Nulls.FAIL) public void setExpectedVersion(Object value) {
        expectedVersion=text(value);
        if (!expectedVersion.matches("[1-9][0-9]{0,18}")) throw new IllegalArgumentException("Invalid version");
        Long.parseLong(expectedVersion);
    }
    @JsonAnySetter public void unknown(String key,Object value) { throw new IllegalArgumentException("Unsupported field"); }
    @JsonIgnore @Schema(hidden=true) @AssertTrue(message="수정할 항목이 필요해요.")
    public boolean isAnyFieldPresent() { return diaryTitle!=null || coverColor!=null || coverStyle!=null; }
}
