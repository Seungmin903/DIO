package com.f106.DIO.diary.creation;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** 페이지 담당 연결 지점. 동일 DB·호출 트랜잭션에 참여하며 원격 호출/REQUIRES_NEW는 사용하지 않는다. */
public interface DiaryInitialPages {
	/** 실제 카탈로그의 활성 상태·버전·허용 설정을 확인하고 생성까지 필요한 상태를 고정한다. */
	void validateSelections(List<Selection> selections);

	/** 각 선택에 대해 한 페이지를 저장하고 sort_key 순서와 같은 ID 목록을 반환한다. */
	List<UUID> create(UUID diaryId, long ownerUserId, List<Selection> selections, Instant createdAt);

	/** HTTP DTO가 아닌 내부 연결 계약. 임의 크기/작성자/OWNER 역할 필드는 받지 않는다. */
	record Selection(String templateCode, String templateVersion, String configurationJson) {
		public Selection { configurationJson = configurationJson == null ? "{}" : configurationJson; }
	}

	class InvalidSelection extends RuntimeException {
		public InvalidSelection(String message) { super(message); }
	}
}
