package com.f106.DIO.diary.config;

import java.math.BigDecimal;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

@Component
@Validated
@ConfigurationProperties(prefix = "dio.diary")
public class DiaryFormatProperties {

	@Valid
	private Map<String, Dimensions> formats = Map.of();

	public Map<String, Dimensions> getFormats() { return formats; }
	public void setFormats(Map<String, Dimensions> formats) { this.formats = formats; }

	public record Dimensions(@NotNull @Positive BigDecimal width, @NotNull @Positive BigDecimal height) {
	}
}
