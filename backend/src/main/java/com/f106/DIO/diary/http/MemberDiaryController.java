package com.f106.DIO.diary.http;

import java.net.URI;
import java.util.UUID;
import com.f106.DIO.diary.creation.IdempotentDiaryCreationService;
import com.f106.DIO.diary.detail.DiaryDetailService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/member/diaries")
@Tag(name="회원 다이어리",description="231 생성·초기 페이지, 233 활성 멤버 상세·OWNER 메타데이터 수정")
@SecurityRequirement(name="bearerAuth")
@ApiResponses({
    @ApiResponse(responseCode="400",description="잘못된 입력/서식/미지원 필드",content=@Content(mediaType="application/problem+json",schema=@Schema(implementation=MemberDiaryProblem.class))),
    @ApiResponse(responseCode="401",description="토큰 부재·만료·변조·비활성 세션",content=@Content(mediaType="application/problem+json",schema=@Schema(implementation=MemberDiaryProblem.class))),
    @ApiResponse(responseCode="403",description="OWNER 외 메타데이터 수정 거부",content=@Content(mediaType="application/problem+json",schema=@Schema(implementation=MemberDiaryProblem.class))),
    @ApiResponse(responseCode="404",description="없는/삭제된/비참여 다이어리",content=@Content(mediaType="application/problem+json",schema=@Schema(implementation=MemberDiaryProblem.class))),
    @ApiResponse(responseCode="409",description="수정 기준 충돌·키 재사용 내용 충돌·동일 키 처리 중·기존 생성 결과 사용 불가",content=@Content(mediaType="application/problem+json",schema=@Schema(implementation=MemberDiaryProblem.class))),
    @ApiResponse(responseCode="500",description="생성 상태 오류",content=@Content(mediaType="application/problem+json",schema=@Schema(implementation=MemberDiaryProblem.class))),
    @ApiResponse(responseCode="503",description="저장소 사용 불가",content=@Content(mediaType="application/problem+json",schema=@Schema(implementation=MemberDiaryProblem.class)))
})
public class MemberDiaryController {
    private final IdempotentDiaryCreationService creation;
    private final MemberDiaryContractService detail;
    private final MemberDiaryListQuery lists;
    public MemberDiaryController(IdempotentDiaryCreationService creation,MemberDiaryContractService detail,MemberDiaryListQuery lists) { this.creation=creation; this.detail=detail; this.lists=lists; }

    @ApiResponse(responseCode="200",description="회원 활성 다이어리 목록",content=@Content(mediaType="application/json",schema=@Schema(implementation=MemberDiaryListQuery.Page.class)))
    @GetMapping
    @Operation(summary="회원 다이어리 목록",description="활성 멤버십 기준. filter=shared와 shared 배지는 활성 멤버 수가 2명 이상, personal은 1명인 다이어리이며 visibility와 독립적입니다. q는 제목 부분 검색, sort는 created/updated/title/pages, limit는 1~100. v4 nextCursor는 같은 계정·검색·정렬·filter·favorite에서만 재사용하며 구 버전은 첫 페이지부터 다시 조회합니다. PostgreSQL ICU 미지원 시 검색·title 정렬은 503 DIARY_LIST_UNAVAILABLE이며 검색 없는 created/updated/pages 목록은 유지됩니다.")
    public ResponseEntity<MemberDiaryListQuery.Page> list(@RequestParam(required=false) String q,@RequestParam(required=false) String sort,
            @RequestParam(required=false) Integer limit,@RequestParam(required=false) String cursor,
            @RequestParam(defaultValue="all") String filter,@RequestParam(defaultValue="false") boolean favorite) {
        return ResponseEntity.ok().header("Cache-Control","no-store").body(lists.list(q,sort,limit,cursor,filter,favorite));
    }

    @PostMapping
    @Operation(summary="회원 다이어리와 초기 페이지 생성",description="PRIVATE 생성. coverColor/coverStyle 생략 또는 null은 #CED9EE/PLAIN으로 정규화합니다. 초기 페이지 기본 상한 512. Idempotency-Key 필수(8~128자 영숫자·._:-). 같은 사용자·키·정규화된 본문은 최초 생성 시점의 응답 스냅샷을 재사용하며 다른 본문은 409입니다. Idempotency-Replayed=true의 diary.version/updatedAt/제목/표지는 최신 상태가 아닐 수 있습니다. 후속 편집 전 상세 GET으로 최신 version을 조회하세요.")
    @ApiResponse(responseCode="201",description="다이어리·OWNER·초기 페이지 전체 생성")
    public ResponseEntity<MemberDiaryResponses.Created> create(@Valid @RequestBody MemberDiaryRequests.Create request,
            @RequestHeader(value="Idempotency-Key",required=false) @io.swagger.v3.oas.annotations.Parameter(required=true,description="사용자별 생성 키. 재시도 시 같은 값, 새 생성에는 새 값.") String idempotencyKey) {
        var appearance=MemberDiaryRequests.normalizePaperAppearance(request.paperAppearance());
        MemberDiaryRequests.serializeTemplateConfig(request.templateConfig());
        var outcome=creation.create(idempotencyKey,request.metadata(),request.initialPages().stream().map(MemberDiaryRequests.InitialPage::selection).toList(),appearance,request.templateConfig());
        var result=outcome.created();
        return ResponseEntity.created(URI.create("/api/v1/member/diaries/"+result.diary().diaryId())).header("Cache-Control","no-store")
            .header("Idempotency-Replayed",Boolean.toString(outcome.replayed()))
            .body(new MemberDiaryResponses.Created(MemberDiaryResponses.Diary.from(result.diary(),true).withPaperAppearance(appearance).withTemplateConfig(request.templateConfig()),result.firstPageId(),result.pageIds()));
    }
    @GetMapping("/{diaryId}")
    @Operation(summary="회원 다이어리 상세",description="활성 멤버만 조회합니다. 삭제·비참여 자료는 존재 여부를 숨겨 404로 응답합니다.")
    @ApiResponse(responseCode="200",description="활성 멤버의 상세 조회 성공")
    public ResponseEntity<MemberDiaryResponses.Detail> get(@PathVariable UUID diaryId) {
        var result=detail.get(diaryId);
        return ResponseEntity.ok().header("Cache-Control","no-store").body(new MemberDiaryResponses.Detail(result));
    }
    @PatchMapping("/{diaryId}")
    @Operation(summary="회원 다이어리 메타데이터 수정",description="OWNER만 제목·표지색·스타일 수정. expectedVersion에 직전 응답의 양의 BIGINT 문자열 version을 전달합니다. 공개 범위·소유자 변경은 지원하지 않습니다.")
    @ApiResponse(responseCode="200",description="OWNER 수정 성공")
    public ResponseEntity<MemberDiaryResponses.Detail> update(@PathVariable UUID diaryId,@Valid @RequestBody MemberDiaryRequests.Update request) {
        var result=detail.update(diaryId,request);
        return ResponseEntity.ok().header("Cache-Control","no-store").body(new MemberDiaryResponses.Detail(result));
    }
}
