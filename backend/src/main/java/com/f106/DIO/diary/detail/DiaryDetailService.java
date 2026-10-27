package com.f106.DIO.diary.detail;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import jakarta.validation.Validator;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.dto.DiaryResponse;
import com.f106.DIO.diary.dto.DiaryUpdateRequest;

/** 233 활성 멤버 상세 조회와 OWNER 메타데이터 수정. 역할별 정책은 229 계약 제안을 따른다. */
@Service
@Transactional
public class DiaryDetailService {
	private final DiaryDetailRepository repository;
	private final DiaryDetailIdentity identity;
	private final DiaryMembershipAccess memberships;
	private final Validator validator;
	private final Clock clock;

	@Autowired
	public DiaryDetailService(DiaryDetailRepository repository, DiaryDetailIdentity identity, DiaryMembershipAccess memberships,
		Validator validator, ObjectProvider<Clock> clocks) {
		this(repository, identity, memberships, validator, clocks.getIfAvailable(Clock::systemUTC));
	}

	public DiaryDetailService(DiaryDetailRepository repository, DiaryDetailIdentity identity, DiaryMembershipAccess memberships,
		Validator validator, Clock clock) {
		this.repository = repository;
		this.identity = identity;
		this.memberships = memberships;
		this.validator = validator;
		this.clock = clock;
	}

	public DiaryResponse get(UUID diaryId) {
		return new DiaryResponse(getAuthorized(diaryId).diary());
	}

	public Authorized getAuthorized(UUID diaryId) {
		long userId = authenticate(diaryId);
		var diary = activeDiary(diaryId, false);
		var role = requireRole(userId, diary);
		return new Authorized(diary.data(),role == DiaryMembershipAccess.Role.OWNER);
	}
	public record Authorized(com.f106.DIO.diary.dto.DiaryCreateResponse.DiaryData diary,boolean canEdit) {}

	public DiaryResponse update(UUID diaryId, DiaryUpdateRequest patch, Instant expectedUpdatedAt) {
		long userId = authenticate(diaryId);
		var diary = activeDiary(diaryId, true);
		if (requireRole(userId, diary) != DiaryMembershipAccess.Role.OWNER) {
			throw new DiaryDetailException(HttpStatus.FORBIDDEN, "DIARY_METADATA_FORBIDDEN", "다이어리 소유자만 제목과 표지를 수정할 수 있습니다.");
		}
		if (patch == null || !validator.validate(patch).isEmpty() || patch.getVisibility() != null
			|| expectedUpdatedAt == null || !expectedUpdatedAt.equals(expectedUpdatedAt.truncatedTo(ChronoUnit.MICROS))) {
			throw DiaryDetailException.invalid();
		}
		if (!diary.updatedAt().equals(expectedUpdatedAt)) throw conflict();
		String title = patch.getDiaryTitle() == null ? diary.title() : patch.getDiaryTitle();
		String color = patch.getCoverColor() == null ? diary.color() : patch.getCoverColor();
		String style = patch.getCoverStyle() == null ? diary.style() : patch.getCoverStyle();
		if (title.equals(diary.title()) && color.equals(diary.color()) && style.equals(diary.style())) return new DiaryResponse(diary.data());
		Instant next = clock.instant().truncatedTo(ChronoUnit.MICROS);
		if (!next.isAfter(diary.updatedAt())) next = diary.updatedAt().plus(1, ChronoUnit.MICROS);
		if (!repository.update(diary, title, color, style, next)) throw conflict();
		return new DiaryResponse(new DiaryDetailRepository.Snapshot(diary.id(), diary.ownerUserId(), title, color, style,
			diary.visibility(), diary.createdAt(), next, null).data());
	}

	private long authenticate(UUID diaryId) {
		long userId = identity.requireUserId();
		if (userId <= 0) throw DiaryDetailException.unauthorized();
		if (diaryId == null) throw DiaryDetailException.invalid();
		if (!repository.lockActiveUser(userId)) throw DiaryDetailException.unauthorized();
		return userId;
	}

	private DiaryMembershipAccess.Role requireRole(long userId, DiaryDetailRepository.Snapshot diary) {
		var role = memberships.requireActiveRole(userId, diary.id(), diary.ownerUserId());
		if (role == null || diary.ownerUserId() == null || (role == DiaryMembershipAccess.Role.OWNER) != (diary.ownerUserId() == userId)) {
			throw DiaryDetailException.notFound();
		}
		return role;
	}

	private DiaryDetailRepository.Snapshot activeDiary(UUID diaryId, boolean writing) {
		var diary = repository.lock(diaryId, writing).orElseThrow(DiaryDetailException::notFound);
		if (diary.deletedAt() != null) throw DiaryDetailException.notFound();
		return diary;
	}

	private DiaryDetailException conflict() {
		return new DiaryDetailException(HttpStatus.CONFLICT, "DIARY_METADATA_CONFLICT", "다이어리가 변경됐습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.");
	}
}
