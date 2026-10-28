package com.f106.DIO.diary.domain;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 다이어리 접근 역할. OWNER·EDITOR는 저장 내용을 변경할 수 있고 VIEWER는 조회만 가능하다. */
@Entity
@Table(name = "diary_members")
@IdClass(DiaryMemberId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DiaryMember {
	@Id private UUID diaryId;
	@Id private Long userId;
	@Column(nullable = false, length = 20) private String role;
	@Column(nullable = false, columnDefinition = "char(7)") @JdbcTypeCode(SqlTypes.CHAR) private String memberColor;
	@Column(nullable = false) private boolean isFavorite;
	private UUID lastOpenedPageId;
	private Instant lastOpenedAt;
	@Column(nullable = false, updatable = false) private Instant joinedAt;
	private Instant leftAt;

	public DiaryMember(UUID diaryId, Long userId, String role) {
		this.diaryId = diaryId;
		this.userId = userId;
		this.role = role;
		this.memberColor = "#6F9FC6";
		this.joinedAt = now();
	}

	public boolean canWrite() {
		return "OWNER".equals(role) || "EDITOR".equals(role);
	}

	private static Instant now() {
		return Instant.now().truncatedTo(ChronoUnit.MICROS);
	}
}
