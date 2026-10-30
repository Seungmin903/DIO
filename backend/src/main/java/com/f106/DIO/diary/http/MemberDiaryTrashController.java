package com.f106.DIO.diary.http;

import java.util.UUID;
import com.f106.DIO.diary.dto.DiaryTrashResponse;
import com.f106.DIO.diary.trash.DiaryTrashService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(value="/api/v1/member/diaries",produces=org.springframework.http.MediaType.APPLICATION_JSON_VALUE)
@Tag(name="회원 휴지통",description="234 활성 OWNER의 휴지통 이동·조회·기간 내 복원. 영구 삭제는 포함하지 않습니다.")
@SecurityRequirement(name="bearerAuth")
public class MemberDiaryTrashController {
    private final DiaryTrashService trash;
    private final MemberDiaryContractService contract;
    public MemberDiaryTrashController(DiaryTrashService trash,MemberDiaryContractService contract) { this.trash=trash; this.contract=contract; }

    @GetMapping("/trash")
    @Operation(summary="본인 소유 휴지통 목록",description="q: 제목 부분 검색(최대 100자). limit: 1~100, 기본 20. 삭제 시각/UUID 내림차순. cursor는 같은 계정과 검색에서만 재사용. 만료 항목은 canRestore=false이며 조회로 물리 삭제하지 않습니다.")
    public ResponseEntity<DiaryTrashResponse> list(@RequestParam(required=false) String q,
            @RequestParam(required=false) Integer limit,@RequestParam(required=false) String cursor) {
        return ResponseEntity.ok().header("Cache-Control","no-store").body(trash.list(q,limit,cursor));
    }

    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode="204",description="휴지통 이동 완료·반복 요청 무변경",content=@io.swagger.v3.oas.annotations.media.Content)
    @DeleteMapping("/{diaryId}")
    @Operation(summary="소유 다이어리를 휴지통으로 이동",description="활성 OWNER만 허용. 최초 서버 삭제 시각을 기록하며 반복 요청은 204이고 보관 기한을 연장하지 않습니다. 활성 EDITOR는 403, 비참여/탈퇴/없는 ID는 404입니다. 실제 전환에만 version을 증가시킵니다.")
    public ResponseEntity<Void> remove(@PathVariable UUID diaryId,@io.swagger.v3.oas.annotations.Parameter(hidden=true) @RequestParam java.util.Map<String,String> query,@io.swagger.v3.oas.annotations.Parameter(hidden=true) @RequestBody(required=false) String body) {
        requireEmpty(query,body);
        trash.trash(diaryId);
        return ResponseEntity.noContent().header("Cache-Control","no-store").build();
    }

    @PostMapping("/{diaryId}/restore")
    @Operation(summary="소유 다이어리 복원",description="최초 삭제 시각 + 정확히 30×24시간 직전까지만 복원. 정확히 만료 시각부터 410/DIARY_RESTORE_EXPIRED. 이미 활성인 자료는 같은 상태를 200으로 반환. 자식 페이지·멤버십·취소 초대 상태는 바꾸지 않습니다.")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<MemberDiaryResponses.Detail> restore(@PathVariable UUID diaryId,@io.swagger.v3.oas.annotations.Parameter(hidden=true) @RequestParam java.util.Map<String,String> query,@io.swagger.v3.oas.annotations.Parameter(hidden=true) @RequestBody(required=false) String body) {
        requireEmpty(query,body);
        trash.restore(diaryId);
        return ResponseEntity.ok().header("Cache-Control","no-store")
            .body(new MemberDiaryResponses.Detail(contract.get(diaryId)));
    }
    private static void requireEmpty(java.util.Map<String,String> query,String body) {
        if(!query.isEmpty() || (body!=null && !body.isBlank())) throw new MemberDiaryRequestException("INVALID_MEMBER_DIARY_REQUEST");
    }
}
