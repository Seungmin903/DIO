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
    private final DiaryDetailService detail;
    private final MemberDiaryListQuery lists;
    public MemberDiaryController(IdempotentDiaryCreationService creation,DiaryDetailService detail,MemberDiaryListQuery lists) { this.creation=creation; this.detail=detail; this.lists=lists; }

    @GetMapping
    @Operation(summary="회원 다이어리 목록",description="활성 멤버십 기준. q는 제목 부분 검색, sort는 created/updated/title/pages, limit는 1~100. nextCursor는 같은 계정·검색·정렬에서만 재사용합니다.")
    public ResponseEntity<MemberDiaryListQuery.Page> list(@RequestParam(required=false) String q,@RequestParam(required=false) String sort,
            @RequestParam(required=false) Integer limit,@RequestParam(required=false) String cursor) {
        return ResponseEntity.ok().header("Cache-Control","no-store").body(lists.list(q,sort,limit,cursor));
    }

    @PostMapping
    @Operation(summary="회원 다이어리와 초기 페이지 생성",description="PRIVATE 생성. 초기 페이지 기본 상한 512. Idempotency-Key 필수(8~128자 영숫자·._:-). 같은 사용자·키·정규화된 본문은 최초 응답을 재사용하며 다른 본문은 409입니다.")
    @ApiResponse(responseCode="201",description="다이어리·OWNER·초기 페이지 전체 생성")
    public ResponseEntity<MemberDiaryResponses.Created> create(@Valid @RequestBody MemberDiaryRequests.Create request,
            @RequestHeader(value="Idempotency-Key",required=false) @io.swagger.v3.oas.annotations.Parameter(required=true,description="사용자별 생성 키. 재시도 시 같은 값, 새 생성에는 새 값.") String idempotencyKey) {
        var outcome=creation.create(idempotencyKey,request.metadata(),request.initialPages().stream().map(MemberDiaryRequests.InitialPage::selection).toList());
        var result=outcome.created();
        return ResponseEntity.created(URI.create("/api/v1/member/diaries/"+result.diary().diaryId())).header("Cache-Control","no-store")
            .header("Idempotency-Replayed",Boolean.toString(outcome.replayed()))
            .body(new MemberDiaryResponses.Created(MemberDiaryResponses.Diary.from(result.diary(),true),result.firstPageId(),result.pageIds()));
    }
    @GetMapping("/{diaryId}")
    @Operation(summary="회원 다이어리 상세",description="활성 멤버만 조회합니다. 삭제·비참여 자료는 존재 여부를 숨겨 404로 응답합니다.")
    @ApiResponse(responseCode="200",description="활성 멤버의 상세 조회 성공")
    public ResponseEntity<MemberDiaryResponses.Detail> get(@PathVariable UUID diaryId) {
        var result=detail.getAuthorized(diaryId);
        return ResponseEntity.ok().header("Cache-Control","no-store").body(new MemberDiaryResponses.Detail(MemberDiaryResponses.Diary.from(result.diary(),result.canEdit())));
    }
    @PatchMapping("/{diaryId}")
    @Operation(summary="회원 다이어리 메타데이터 수정",description="OWNER만 제목·표지색·스타일 수정. expectedUpdatedAt에 직전 응답 updatedAt을 그대로 전달합니다. 공개 범위·소유자 변경은 지원하지 않습니다.")
    @ApiResponse(responseCode="200",description="OWNER 수정 성공")
    public ResponseEntity<MemberDiaryResponses.Detail> update(@PathVariable UUID diaryId,@Valid @RequestBody MemberDiaryRequests.Update request) {
        var result=detail.update(diaryId,request.patch(),request.getExpectedUpdatedAt());
        return ResponseEntity.ok().header("Cache-Control","no-store").body(new MemberDiaryResponses.Detail(MemberDiaryResponses.Diary.from(result.diary(),true)));
    }
}
