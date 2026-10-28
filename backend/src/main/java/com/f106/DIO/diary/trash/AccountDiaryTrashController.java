package com.f106.DIO.diary.trash;

import com.f106.DIO.diary.read.*;
import java.security.Principal;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.*;

@RestController
@RequestMapping("/api/v1/diaries")
@io.swagger.v3.oas.annotations.security.SecurityRequirement(name="bearerAuth")
@ApiResponses({@ApiResponse(responseCode="400",description="잘못된 UUID·쿼리·본문"),
    @ApiResponse(responseCode="401",description="인증 필요"),@ApiResponse(responseCode="403",description="DIARY_OWNER_REQUIRED "),
    @ApiResponse(responseCode="404",description="DIARY_NOT_FOUND"),@ApiResponse(responseCode="409",description="DIARY_NOT_TRASHED, VERSION_EXHAUSTED 또는 VERSION_CONFLICT")})
public class AccountDiaryTrashController {
    private final AccountDiaryTrashService service;
    private final AccountDiaryPurgeService purge;
    public AccountDiaryTrashController(AccountDiaryTrashService service,AccountDiaryPurgeService purge){this.service=service;this.purge=purge;}
    @io.swagger.v3.oas.annotations.Parameter(name="permanent",in=io.swagger.v3.oas.annotations.enums.ParameterIn.QUERY,
        description="true: 휴지통 다이어리 영구 삭제. false 또는 생략: 휴지통 이동.",
        schema=@io.swagger.v3.oas.annotations.media.Schema(type="boolean",defaultValue="false"))
    @DeleteMapping("/{diaryId}")
    @Operation(summary="소유자의 다이어리 휴지통 이동 또는 영구 삭제",description="본문 없음. permanent=true는 휴지통 다이어리와 하위 데이터를 영구 삭제하고 완료 영수증으로 소유자의 재시도를 허용합니다.")
    @ApiResponse(responseCode="204",description="휴지통 이동·영구 삭제 완료 또는 소유자의 완료 요청 재시도",content=@io.swagger.v3.oas.annotations.media.Content)
    public ResponseEntity<Void> trash(Principal principal,@PathVariable String diaryId,@io.swagger.v3.oas.annotations.Parameter(hidden=true) @RequestParam Map<String,String> query,@RequestBody(required=false) String body) {
        long user=DiaryReadController.user(principal);
        if(query.keySet().stream().anyMatch(k->!k.equals("permanent")) || (query.containsKey("permanent")&&!java.util.Set.of("false","true").contains(query.get("permanent"))))throw new DiaryReadException(400,"INVALID_QUERY","요청 형식을 확인해 주세요.");
        empty(body);if("true".equals(query.get("permanent")))purge.purge(user,diaryId);else service.trash(user,diaryId);
        return ResponseEntity.noContent().header("Cache-Control","no-store").build();
    }
    @PostMapping("/{diaryId}/restore")
    @Operation(summary="소유자의 다이어리 복원",description="본문 없음. 서버 시각이 최초 삭제+30일 미만인 경우 복원. 이미 활성 상태인 경우 변경 없이 현재 DTO 반환.")
    @ApiResponse(responseCode="200",description="복원된 다이어리 또는 이미 활성 상태인 다이어리")
    @ApiResponse(responseCode="410",description="DIARY_RESTORE_EXPIRED")
    public ResponseEntity<DiaryReadDtos.Detail> restore(Principal principal,@PathVariable String diaryId,@io.swagger.v3.oas.annotations.Parameter(hidden=true) @RequestParam Map<String,String> query,@RequestBody(required=false) String body) {
        long user=DiaryReadController.user(principal);if(!query.isEmpty())throw new DiaryReadException(400,"INVALID_QUERY","요청 형식을 확인해 주세요.");empty(body);
        return ResponseEntity.ok().header("Cache-Control","no-store").body(service.restore(user,diaryId));
    }
    private static void empty(String body){if(body!=null&&!body.isBlank())throw new DiaryReadException(400,"INVALID_QUERY","요청 형식을 확인해 주세요.");}
}
