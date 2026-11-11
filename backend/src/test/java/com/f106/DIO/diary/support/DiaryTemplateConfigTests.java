package com.f106.DIO.diary.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

@ExtendWith(OutputCaptureExtension.class)
class DiaryTemplateConfigTests {
    @BeforeEach void reset() { DiaryTemplateConfig.resetWarnings(); }

    @Test void strictReadStillThrowsOnCorruptValue() {
        assertThat(DiaryTemplateConfig.read(null)).isNull();
        assertThatThrownBy(() -> DiaryTemplateConfig.read("{broken")).isInstanceOf(tools.jackson.core.JacksonException.class);
    }

    @Test void objectIsReturnedWithoutWarning(CapturedOutput output) {
        assertThat(DiaryTemplateConfig.readLenient("{\"orientation\":\"portrait\"}", "d-ok").get("orientation").asString()).isEqualTo("portrait");
        assertThat(DiaryTemplateConfig.readLenient(null, "d-null")).isNull();
        assertThat(output.getAll()).doesNotContain("templateConfig ignored");
    }

    @Test void corruptValueBecomesNullAndLogsIdAndReasonButNotTheValue(CapturedOutput output) {
        assertThat(DiaryTemplateConfig.readLenient("{secret-not-json", "d-parse")).isNull();
        assertThat(output.getAll()).contains("diaryId=d-parse reason=PARSE_FAILED").doesNotContain("secret-not-json");
    }

    @Test void nonObjectBecomesNullAndLogsIdAndReasonButNotTheValue(CapturedOutput output) {
        assertThat(DiaryTemplateConfig.readLenient("[\"secret-array\"]", "d-array")).isNull();
        assertThat(output.getAll()).contains("diaryId=d-array reason=NOT_OBJECT detail=ARRAY").doesNotContain("secret-array");
    }

    @Test void repeatedReadsOfTheSameDiaryWarnOnlyOnce(CapturedOutput output) {
        for (int i = 0; i < 5; i++) DiaryTemplateConfig.readLenient("{broken", "d-repeat");
        DiaryTemplateConfig.readLenient("{broken", "d-other");
        String all = output.getAll();
        assertThat(all.split("diaryId=d-repeat", -1).length - 1).isEqualTo(1);
        assertThat(all).contains("diaryId=d-other");
    }
}
