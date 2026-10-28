package com.f106.DIO.page.domain;

import java.math.BigDecimal;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 활성 속지의 기본 크기와 설정을 읽기 위한 최소 매핑이다. */
@Entity
@Table(name = "page_templates")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PageTemplate {
	@Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long templateId;
	@Column(nullable = false, length = 100) private String code;
	@Column(nullable = false, precision = 10, scale = 2) private BigDecimal canvasWidth;
	@Column(nullable = false, precision = 10, scale = 2) private BigDecimal canvasHeight;
	@JdbcTypeCode(SqlTypes.JSON) private String defaultConfig;
	@Column(nullable = false) private boolean isActive;
}
