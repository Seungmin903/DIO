package com.f106.DIO.diary.support;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

@ExtendWith(OutputCaptureExtension.class)
class DiaryTemplateConfigTests {
    @Test void objectIsReturnedWithoutWarning(CapturedOutput output) {
        assertThat(DiaryTemplateConfig.read("{\"orientation\":\"portrait\"}").get("orientation").asString()).isEqualTo("portrait");
        assertThat(DiaryTemplateConfig.read(null)).isNull();
        assertThat(output.getAll()).doesNotContain("templateConfig ignored");
    }

    @Test void corruptValueBecomesNullAndLogsOnlyTheReason(CapturedOutput output) {
        assertThat(DiaryTemplateConfig.read("{secret-not-json")).isNull();
        assertThat(output.getAll()).contains("reason=PARSE_FAILED").doesNotContain("secret-not-json");
    }

    @Test void nonObjectBecomesNullAndLogsOnlyTheReason(CapturedOutput output) {
        assertThat(DiaryTemplateConfig.read("[\"secret-array\"]")).isNull();
        assertThat(output.getAll()).contains("reason=NOT_OBJECT nodeType=ARRAY").doesNotContain("secret-array");
    }
}
