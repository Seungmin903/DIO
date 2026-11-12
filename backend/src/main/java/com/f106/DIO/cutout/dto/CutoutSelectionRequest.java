package com.f106.DIO.cutout.dto;

import java.util.List;
import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 탭(points) 또는 붓(strokes) 중 하나. 좌표는 EXIF 회전을 적용한 사진 기준 0~1 비율이다. */
public record CutoutSelectionRequest(
		@Schema(description = "탭한 점들 (A안)") @Valid @Size(min = 1, max = 64) List<TapPoint> points,
		@Schema(description = "붓질 (B안). 지우개 획은 결과에서도 지운다") @Valid @Size(min = 1, max = 150) List<Stroke> strokes) {

	@AssertTrue(message = "points와 strokes 중 하나만 보내 주세요.")
	@Schema(hidden = true)
	public boolean isOneSelection() { return (points == null) != (strokes == null); }

	public record Point(
			@NotNull @DecimalMin("0") @DecimalMax("1") Double x,
			@NotNull @DecimalMin("0") @DecimalMax("1") Double y) {}

	@JsonInclude(JsonInclude.Include.NON_NULL)
	public record TapPoint(
			@NotNull @DecimalMin("0") @DecimalMax("1") Double x,
			@NotNull @DecimalMin("0") @DecimalMax("1") Double y,
			@Schema(description = "1=포함, 0=제외") @Min(0) @Max(1) Integer label) {}

	public record Stroke(
			@Schema(description = "include=선택 붓, exclude=지우개") @NotNull @Pattern(regexp = "include|exclude") String mode,
			@Schema(description = "붓 반지름 (사진 가로 대비 비율)") @NotNull @DecimalMin(value = "0", inclusive = false) @DecimalMax("0.5") Double size,
			@Valid @NotEmpty @Size(max = 1200) List<Point> points) {}
}
