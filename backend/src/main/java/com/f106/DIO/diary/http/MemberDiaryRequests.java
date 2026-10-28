package com.f106.DIO.diary.http;

import java.time.Instant;
import java.util.List;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import com.f106.DIO.diary.creation.DiaryInitialPages;
import com.f106.DIO.diary.dto.DiaryCreateRequest;
import com.f106.DIO.diary.dto.DiaryUpdateRequest;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import tools.jackson.databind.JsonNode;

public final class MemberDiaryRequests {
    private MemberDiaryRequests() {}

    public record Create(
        @NotBlank @Size(max=100) String diaryTitle,
        @Schema(description="생략 또는 null이면 #CED9EE. 지문 계산과 저장 전에 기본값 적용") @Pattern(regexp="#[0-9a-fA-F]{6}") String coverColor,
        @Schema(description="생략 또는 null이면 PLAIN. 지문 계산과 저장 전에 기본값 적용") @Size(max=30) @Pattern(regexp="(?s).*\\S.*") String coverStyle,
        @NotNull @Size(min=1,max=4096) @Valid List<@NotNull @Valid InitialPage> initialPages
    ) {
        public Create { if(diaryTitle!=null) diaryTitle=com.f106.DIO.diary.support.DiaryTitle.normalize(diaryTitle); }
        public DiaryCreateRequest metadata() { return new DiaryCreateRequest(diaryTitle,coverColor,coverStyle,"PRIVATE"); }
        @JsonAnySetter public void unsupported(String name,Object value) { throw new IllegalArgumentException("Unsupported create field"); }
    }
    public record InitialPage(
        @NotBlank @Size(max=100) String templateCode,
        @NotBlank @Size(max=30) String templateVersion,
        @NotNull @Schema(type="object",description="카탈로그 규격에 맞는 width/height, paperAppearance, blank 설정") JsonNode templateConfig
    ) {
        public DiaryInitialPages.Selection selection() {
            if(!templateConfig.isObject()) throw new MemberDiaryRequestException("INVALID_INITIAL_PAGES");
            return new DiaryInitialPages.Selection(templateCode,templateVersion,templateConfig.toString());
        }
        @JsonAnySetter public void unsupported(String name,Object value) { throw new IllegalArgumentException("Unsupported initial page field"); }
    }

    public static class Update {
        @NotNull @Pattern(regexp="[1-9][0-9]{0,18}") private String expectedVersion;
        @Size(min=1,max=100) private String diaryTitle;
        @Pattern(regexp="#[0-9a-fA-F]{6}") private String coverColor;
        @Size(max=30) @Pattern(regexp="(?s).*\\S.*") private String coverStyle;

        public String getExpectedVersion() { return expectedVersion; }
        public String getDiaryTitle() { return diaryTitle; }
        public String getCoverColor() { return coverColor; }
        public String getCoverStyle() { return coverStyle; }
        @JsonSetter(nulls=Nulls.FAIL) public void setExpectedVersion(Object value) { if(!(value instanceof String s) || !s.matches("[1-9][0-9]{0,18}")) throw new IllegalArgumentException("Invalid version"); Long.parseLong(s); expectedVersion=s; }
        @JsonSetter(nulls=Nulls.FAIL) public void setDiaryTitle(String value) { diaryTitle=com.f106.DIO.diary.support.DiaryTitle.normalize(value); }
        @JsonSetter(nulls=Nulls.FAIL) public void setCoverColor(String value) { coverColor=value; }
        @JsonSetter(nulls=Nulls.FAIL) public void setCoverStyle(String value) { coverStyle=value; }
        @JsonAnySetter public void unsupported(String name,Object value) { throw new IllegalArgumentException("Unsupported update field"); }
        @AssertTrue @Schema(hidden=true) public boolean isMetadataPresent() { return diaryTitle!=null || coverColor!=null || coverStyle!=null; }
        public DiaryUpdateRequest patch() {
            var patch=new DiaryUpdateRequest();
            if(diaryTitle!=null) patch.setDiaryTitle(diaryTitle);
            if(coverColor!=null) patch.setCoverColor(coverColor);
            if(coverStyle!=null) patch.setCoverStyle(coverStyle);
            return patch;
        }
    }
}
