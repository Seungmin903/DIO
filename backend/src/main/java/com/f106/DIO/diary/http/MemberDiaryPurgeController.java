package com.f106.DIO.diary.http;

import java.util.UUID;
import com.f106.DIO.diary.purge.DiaryPurgeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/member/diaries")
@Tag(name="회원 휴지통")
@SecurityRequirement(name="bearerAuth")
@ApiResponses({
    @ApiResponse(responseCode="400",description="잘못된 UUID",content=@Content(mediaType="application/problem+json",schema=@Schema(implementation=MemberDiaryProblem.class))),
    @ApiResponse(responseCode="401",description="무인증·만료·취소·비활성 계정",content=@Content(mediaType="application/problem+json",schema=@Schema(implementation=MemberDiaryProblem.class))),
    @ApiResponse(responseCode="403",description="활성 EDITOR는 소유자 작업 불가",content=@Content(mediaType="application/problem+json",schema=@Schema(implementation=MemberDiaryProblem.class))),
    @ApiResponse(responseCode="404",description="없는/타인/비활성 OWNER 자료. 완료 기록이 있는 소유자 재요청은 204.",content=@Content(mediaType="application/problem+json",schema=@Schema(implementation=MemberDiaryProblem.class))),
    @ApiResponse(responseCode="503",description="잠금·저장소 일시 오류. 전체 롤백 후 재시도.",content=@Content(mediaType="application/problem+json",schema=@Schema(implementation=MemberDiaryProblem.class)))
})
public class MemberDiaryPurgeController {
    private final DiaryPurgeService purge;
    public MemberDiaryPurgeController(DiaryPurgeService purge) { this.purge=purge; }
    @DeleteMapping("/{diaryId}/purge")
    @Operation(summary="휴지통 다이어리 영구 삭제",description="검증된 활성 OWNER만 허용. 휴지통 기간과 관계없이 수동 삭제. DB 자식 데이터·참조를 한 트랜잭션으로 제거하며 미디어/폰트 원본과 외부 저장소 파일은 보존. 완료한 소유자의 동일 ID 재요청은 204이며 완료 시각을 유지합니다. 활성 EDITOR는 403, 비참여·탈퇴·미확인 ID는 404입니다. 요청 body와 query는 없습니다.")
    @ApiResponse(responseCode="204",description="DB 다이어리·자식 데이터·참조 정리 완료 또는 완료한 소유자 재시도, 미디어 원본 보존",content=@Content)
    @ApiResponse(responseCode="409",description="DIARY_NOT_TRASHED: 활성 다이어리는 영구 삭제할 수 없음")
    public ResponseEntity<Void> purge(@PathVariable UUID diaryId,@io.swagger.v3.oas.annotations.Parameter(hidden=true) @RequestParam java.util.Map<String,String> query,@io.swagger.v3.oas.annotations.Parameter(hidden=true) @RequestBody(required=false) String body) {
        if(!query.isEmpty() || (body!=null && !body.isBlank())) throw new MemberDiaryRequestException("INVALID_MEMBER_DIARY_REQUEST");
        purge.purge(diaryId);
        return ResponseEntity.noContent().header("Cache-Control","no-store").build();
    }
}
