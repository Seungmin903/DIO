package com.f106.DIO.diary.domain;

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
@Table(name = "diaries")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Diary {

	@Id
	private UUID diaryId;

	private Long ownerUserId;
	@Column(name="inventory_shared",nullable=false,columnDefinition="boolean default false")
	private boolean inventoryShared;

	@Version
	@Column(nullable=false,columnDefinition="bigint default 1")
	private Long version;

	@Column(length = 64)
	private String ownerDeviceId;

	@Column(nullable = false, length = 100)
	private String title;

	@Column(nullable = false, columnDefinition = "char(7)")
	@JdbcTypeCode(SqlTypes.CHAR)
	private String coverColor;

	@Column(nullable = false, length = 30)
	private String coverStyle;

	@Column(columnDefinition = "text")
	private String coverJson;

	@Column(columnDefinition = "text")
	private String paperAppearanceJson;

	@Column(columnDefinition = "text")
	private String templateConfigJson;

	public void updatePaperAppearance(String appearance) {
		this.paperAppearanceJson = appearance;
		this.updatedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
	}

	@Column(nullable = false, length = 30)
	private String visibility;

	@Column(nullable = false, updatable = false)
	private Instant createdAt;

	@Column(nullable = false)
	private Instant updatedAt;

	private Instant deletedAt;

	public Diary(String title, String coverColor, String coverStyle, String visibility, Long ownerUserId) {
		this.title = title;
		this.coverColor = coverColor;
		this.coverStyle = coverStyle;
		this.visibility = visibility;
        this.inventoryShared = "MEMBERS".equals(visibility);
		this.ownerUserId = ownerUserId;
	}

	/** 로컬 시드처럼 외부에서 안정적인 식별자를 정해 복원할 때만 사용한다. */
	public Diary(UUID diaryId, String title, String coverColor, String coverStyle, String visibility) {
		this.diaryId = diaryId;
		this.title = title;
		this.coverColor = coverColor;
		this.coverStyle = coverStyle;
		this.visibility = visibility;
        this.inventoryShared = "MEMBERS".equals(visibility);
	}

	/** 로컬 전용 시드의 기존 행에만 소유자를 연결한다. */
	public void claimOwnerIfMissing(Long userId) {
		if (ownerUserId == null) ownerUserId = userId;
	}

	public void updateSettings(String title, String coverColor, String coverStyle, String visibility) {
		if (title != null) { this.title = title; }
		if (coverColor != null) { this.coverColor = coverColor; }
		if (coverStyle != null) { this.coverStyle = coverStyle; }
		if (visibility != null) { this.visibility = visibility; if("MEMBERS".equals(visibility)) inventoryShared=true; }
		updatedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
	}

	public void softDelete() {
		Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
		deletedAt = now;
		updatedAt = now;
	}

	public void transferOwnership(Long ownerUserId) {
		this.ownerUserId = java.util.Objects.requireNonNull(ownerUserId);
		updatedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
	}

	@PrePersist
	void initializeTimestamps() {
		Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
		if (version == null) version=1L;
		if (diaryId == null) { diaryId = UUID.randomUUID(); }
		if (coverColor == null) { coverColor = "#CED9EE"; }
		if (coverStyle == null) { coverStyle = "PLAIN"; }
		if (visibility == null) { visibility = "PRIVATE"; }
		createdAt = now;
		updatedAt = now;
	}
}
