package com.f106.DIO.page.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "pages")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DiaryPage {
	@Id private UUID pageId;
	@Column(nullable = false) private UUID diaryId;
	private Long templateId;
	@JdbcTypeCode(SqlTypes.JSON) private String templateConfig;
	@Column(length = 100) private String title;
	@Column(nullable = false, precision = 20, scale = 10) private BigDecimal sortKey;
	@Column(nullable = false, precision = 10, scale = 2) private BigDecimal canvasWidth;
	@Column(nullable = false, precision = 10, scale = 2) private BigDecimal canvasHeight;
	@Column(nullable = false) private boolean gridVisible;
	@Column(columnDefinition = "char(7)") @JdbcTypeCode(SqlTypes.CHAR) private String gridColor;
	@Version @Column(nullable = false) private Long version;
	@Column(nullable = false, updatable = false) private Instant createdAt;
	@Column(nullable = false) private Instant updatedAt;
	private Instant deletedAt;

	public DiaryPage(UUID diaryId, Long templateId, String templateConfig, String title, BigDecimal sortKey,
		BigDecimal canvasWidth, BigDecimal canvasHeight, boolean gridVisible, String gridColor) {
		this(null, diaryId, templateId, templateConfig, title, sortKey, canvasWidth, canvasHeight, gridVisible, gridColor);
	}
	/** 로컬 시드처럼 외부에서 안정적인 식별자를 정해 복원할 때만 사용한다. */
	public DiaryPage(UUID pageId, UUID diaryId, Long templateId, String templateConfig, String title, BigDecimal sortKey,
		BigDecimal canvasWidth, BigDecimal canvasHeight, boolean gridVisible, String gridColor) {
		this.pageId = pageId;
		this.diaryId = diaryId; this.templateId = templateId; this.templateConfig = templateConfig; this.title = title;
		this.sortKey = sortKey; this.canvasWidth = canvasWidth; this.canvasHeight = canvasHeight;
		this.gridVisible = gridVisible; this.gridColor = gridColor;
	}
	public void updateSettings(Long templateId, String templateConfig, boolean replaceTemplateConfig, String title, BigDecimal canvasWidth,
		BigDecimal canvasHeight, Boolean gridVisible, String gridColor) {
		if (templateId != null) this.templateId = templateId;
		if (replaceTemplateConfig) this.templateConfig = templateConfig;
		if (title != null) this.title = title;
		if (canvasWidth != null) this.canvasWidth = canvasWidth;
		if (canvasHeight != null) this.canvasHeight = canvasHeight;
		if (gridVisible != null) this.gridVisible = gridVisible;
		if (gridColor != null) this.gridColor = gridColor;
	}
	public void reorder(BigDecimal sortKey) { this.sortKey = sortKey; }
	public void softDelete() { deletedAt = now(); }
	@PrePersist void initialize() { if (pageId == null) pageId = UUID.randomUUID(); if (version == null) version = 1L; Instant now = now(); createdAt = now; updatedAt = now; }
	@PreUpdate void updateTimestamp() { updatedAt = now(); }
	private static Instant now() { return Instant.now().truncatedTo(ChronoUnit.MICROS); }
}
