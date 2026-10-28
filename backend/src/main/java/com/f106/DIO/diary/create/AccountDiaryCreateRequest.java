package com.f106.DIO.diary.create;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.Locale;

@Schema(requiredProperties={"diaryTitle","coverColor","coverStyle","firstPage"})
public record AccountDiaryCreateRequest(
    @NotBlank @Size(max=100) @Pattern(regexp="[^\\p{Cntrl}]+") String diaryTitle,
    @NotBlank @Pattern(regexp="#[0-9A-F]{6}") String coverColor,
    @NotBlank @Pattern(regexp="PLAIN|LINEN|LEATHER|DOT|GINGHAM|STRIPE") String coverStyle,
    @NotNull @Valid FirstPage firstPage
) {
    public AccountDiaryCreateRequest {
        diaryTitle=com.f106.DIO.diary.support.DiaryTitle.normalize(diaryTitle);
        coverColor=coverColor==null?null:coverColor.toUpperCase(Locale.ROOT);
    }
    @JsonAnySetter public void unknown(String name,Object value) { throw new IllegalArgumentException("Unsupported field"); }
    @Schema(requiredProperties={"type","orientation"})
    public record FirstPage(@NotNull @Pattern(regexp="BLANK") String type,
                            @NotNull @Pattern(regexp="landscape|portrait") String orientation) {
        @JsonAnySetter public void unknown(String name,Object value) { throw new IllegalArgumentException("Unsupported firstPage field"); }
        public int width() { return orientation.equals("portrait")?800:1280; }
        public int height() { return orientation.equals("portrait")?1280:800; }
    }
}
