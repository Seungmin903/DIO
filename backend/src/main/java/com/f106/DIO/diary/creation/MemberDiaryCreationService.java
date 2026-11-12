package com.f106.DIO.diary.creation;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Validator;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.f106.DIO.diary.dto.DiaryCreateRequest;
import com.f106.DIO.diary.dto.DiaryCreateResponse.DiaryData;

/** 231 트랜잭션 기반. 기존 비회원 생성 경로는 전환하지 않고 페이지·공유 연결 계약을 분리한다. */
@Service
public class MemberDiaryCreationService {
    @org.springframework.beans.factory.annotation.Autowired private com.f106.DIO.inventory.InventoryLimits inventory;
	private final MemberDiaryCreationRepository repository;
	private final DiaryCreationIdentity identity;
	private final DiaryOwnerMembershipWriter membership;
	private final DiaryInitialPages pages;
	private final Validator validator;
	private final Clock clock;
	private final int maxPages;

	@Autowired
	public MemberDiaryCreationService(MemberDiaryCreationRepository repository,DiaryCreationIdentity identity,
		DiaryOwnerMembershipWriter membership,DiaryInitialPages pages,Validator validator,ObjectProvider<Clock> clocks,
		@Value("${dio.diary.initial-pages.max-count:512}") int maxPages) {
		this(repository,identity,membership,pages,validator,clocks.getIfAvailable(Clock::systemUTC),maxPages);
	}
	public MemberDiaryCreationService(MemberDiaryCreationRepository repository,DiaryCreationIdentity identity,
		DiaryOwnerMembershipWriter membership,DiaryInitialPages pages,Validator validator,Clock clock,int maxPages) {
		if (maxPages < 1 || maxPages > 4096) throw new IllegalArgumentException("Invalid initial page limit");
		this.repository=repository; this.identity=identity; this.membership=membership; this.pages=pages;
		this.validator=validator; this.clock=clock; this.maxPages=maxPages;
	}

	@Transactional
	public Created create(DiaryCreateRequest metadata,List<DiaryInitialPages.Selection> selections) {
		if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("Creation requires the Spring transaction boundary");
		long userId = identity.requireUserId();
		if (userId <= 0) throw DiaryCreationException.unauthorized();
		String memberColor = repository.lockActiveUserColor(userId).orElseThrow(DiaryCreationException::unauthorized);
		if (memberColor == null || !memberColor.matches("#[0-9a-fA-F]{6}")) throw DiaryCreationException.invalidState();
		if (metadata == null || !validator.validate(metadata).isEmpty() || !"PRIVATE".equals(metadata.visibility())
			|| selections == null || selections.isEmpty() || selections.size() > maxPages) throw DiaryCreationException.invalid();
		for (var selection : selections) {
			if (selection == null || selection.templateCode() == null || selection.templateCode().isBlank() || selection.templateCode().length()>100
				|| selection.templateVersion() == null || selection.templateVersion().isBlank() || selection.templateVersion().length()>30) {
				throw DiaryCreationException.invalid();
			}
		}
		com.f106.DIO.inventory.InventoryLimits.capacity(com.f106.DIO.inventory.InventoryLimits.Kind.PAGE,0,selections.size());
		var requested = List.copyOf(selections);
		try {
			pages.validateSelections(requested);
			Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS);
			UUID diaryId = UUID.randomUUID();
			repository.insertDiary(diaryId,userId,metadata,now);
			membership.create(diaryId,userId,memberColor,now);
			List<UUID> created = pages.create(diaryId,userId,requested,now);
			if (created == null || created.size()!=requested.size() || created.stream().anyMatch(java.util.Objects::isNull)
				|| new HashSet<>(created).size()!=created.size() || !repository.activePageIds(diaryId).equals(created)
				|| !repository.validOwnerState(diaryId,userId)) throw DiaryCreationException.invalidState();
			inventory.createdDiary(userId,false);
			return new Created(new DiaryData(diaryId.toString(),metadata.diaryTitle(),metadata.coverColor(),metadata.coverStyle(),"PRIVATE",now,now),
				created.get(0).toString(),created.stream().map(UUID::toString).toList());
		} catch (DiaryInitialPages.InvalidSelection invalid) {
			throw new DiaryCreationException(org.springframework.http.HttpStatus.BAD_REQUEST,"INVALID_INITIAL_PAGES","선택한 속지와 설정을 확인해 주세요.");
		}
	}
	public record Created(DiaryData diary,String firstPageId,List<String> pageIds) {
		public Created { pageIds=List.copyOf(pageIds); }
	}
}
