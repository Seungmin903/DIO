package com.ssafy.dio.diary.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "diaries")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Diary {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long diaryId;

	private Long ownerUserId;

	@Column(nullable = false, length = 100)
	private String title;

	@Column(nullable = false, columnDefinition = "char(7)")
	@JdbcTypeCode(SqlTypes.CHAR)
	private String coverColor;

	@Column(nullable = false, length = 30)
	private String coverStyle;

	@Column(nullable = false, length = 30)
	private String coverBinding;

	@Column(nullable = false, length = 30)
	private String formatId;

	@Column(nullable = false, precision = 10, scale = 2)
	private BigDecimal canvasWidth;

	@Column(nullable = false, precision = 10, scale = 2)
	private BigDecimal canvasHeight;

	@Column(nullable = false, length = 20)
	private String defaultPageTemplate;

	@Column(nullable = false, updatable = false)
	private Instant createdAt;

	@Column(nullable = false)
	private Instant updatedAt;

	public Diary(String title, String coverColor, String coverStyle, String coverBinding,
		String formatId, BigDecimal canvasWidth, BigDecimal canvasHeight, String defaultPageTemplate) {
		this.title = title;
		this.coverColor = coverColor;
		this.coverStyle = coverStyle;
		this.coverBinding = coverBinding;
		this.formatId = formatId;
		this.canvasWidth = canvasWidth;
		this.canvasHeight = canvasHeight;
		this.defaultPageTemplate = defaultPageTemplate;
	}

	@PrePersist
	void initializeTimestamps() {
		Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
		createdAt = now;
		updatedAt = now;
	}
}
