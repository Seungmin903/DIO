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
@Table(name = "canvas_elements")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CanvasElement {
	@Id private UUID elementId;
	@Column(nullable = false) private UUID pageId;
	@Column(nullable = false, length = 20) private String elementType;
	private UUID groupId;
	@Column(length = 100) private String name;
	@Column(nullable = false, precision = 20, scale = 10) private BigDecimal sortKey;
	@Column(nullable = false, precision = 12, scale = 3) private BigDecimal x;
	@Column(nullable = false, precision = 12, scale = 3) private BigDecimal y;
	@Column(nullable = false, precision = 12, scale = 3) private BigDecimal width;
	@Column(nullable = false, precision = 12, scale = 3) private BigDecimal height;
	@Column(nullable = false, precision = 7, scale = 3) private BigDecimal rotation;
	@Column(nullable = false, precision = 4, scale = 3) private BigDecimal opacity;
	@Column(nullable = false) private boolean isLocked;
	@Column(nullable = false) private boolean isHidden;
	private UUID mediaFileId;
	@JdbcTypeCode(SqlTypes.JSON) private String propertiesJson;
	private Long createdBy;
	@Version @Column(nullable = false) private Long version;
	@Column(nullable = false, updatable = false) private Instant createdAt;
	@Column(nullable = false) private Instant updatedAt;
	private Instant deletedAt;

	public CanvasElement(UUID elementId, UUID pageId, String elementType, UUID groupId, String name, BigDecimal sortKey,
		BigDecimal x, BigDecimal y, BigDecimal width, BigDecimal height, BigDecimal rotation, BigDecimal opacity,
		boolean isLocked, boolean isHidden, UUID mediaFileId, String propertiesJson) {
		this(elementId, pageId, elementType, groupId, name, sortKey, x, y, width, height, rotation, opacity,
			isLocked, isHidden, mediaFileId, propertiesJson, null);
	}
	public CanvasElement(UUID elementId, UUID pageId, String elementType, UUID groupId, String name, BigDecimal sortKey,
		BigDecimal x, BigDecimal y, BigDecimal width, BigDecimal height, BigDecimal rotation, BigDecimal opacity,
		boolean isLocked, boolean isHidden, UUID mediaFileId, String propertiesJson, Long createdBy) {
		this.elementId = elementId; this.pageId = pageId; this.elementType = elementType; this.groupId = groupId;
		this.name = name; this.sortKey = sortKey; this.x = x; this.y = y; this.width = width; this.height = height;
		this.rotation = rotation; this.opacity = opacity; this.isLocked = isLocked; this.isHidden = isHidden;
		this.mediaFileId = mediaFileId; this.propertiesJson = propertiesJson; this.createdBy = createdBy;
	}
	public void update(UUID groupId, String name, BigDecimal sortKey, BigDecimal x, BigDecimal y, BigDecimal width,
		BigDecimal height, BigDecimal rotation, BigDecimal opacity, Boolean isLocked, Boolean isHidden, UUID mediaFileId, String propertiesJson) {
		if (groupId != null) this.groupId = groupId; if (name != null) this.name = name; if (sortKey != null) this.sortKey = sortKey;
		if (x != null) this.x = x; if (y != null) this.y = y; if (width != null) this.width = width; if (height != null) this.height = height;
		if (rotation != null) this.rotation = rotation; if (opacity != null) this.opacity = opacity; if (isLocked != null) this.isLocked = isLocked;
		if (isHidden != null) this.isHidden = isHidden; if (mediaFileId != null) this.mediaFileId = mediaFileId;
		if (propertiesJson != null) this.propertiesJson = propertiesJson;
	}
	public void softDelete() { deletedAt = now(); }
	public void restore() { deletedAt = null; }
	/** 그룹은 페이지 안에서만 유효하므로 복사본에는 새 그룹 ID를 넘겨받는다. */
	public CanvasElement copyFor(UUID newPageId, BigDecimal nextSortKey, UUID newGroupId, Long copiedBy) {
		return new CanvasElement(null, newPageId, elementType, newGroupId, name, nextSortKey, x, y, width, height, rotation,
			opacity, isLocked, isHidden, mediaFileId, propertiesJson, copiedBy);
	}
	@PrePersist void initialize() { if (elementId == null) elementId = UUID.randomUUID(); if (version == null) version = 1L; Instant now = now(); createdAt = now; updatedAt = now; }
	@PreUpdate void updateTimestamp() { updatedAt = now(); }
	private static Instant now() { return Instant.now().truncatedTo(ChronoUnit.MICROS); }
}
