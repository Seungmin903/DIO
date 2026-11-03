package com.f106.DIO.user.controller;

import com.f106.DIO.user.domain.TermsType;
import com.f106.DIO.user.dto.TermsUpdateRequest;
import com.f106.DIO.user.dto.TermsUpdateResponse;
import com.f106.DIO.user.dto.TermsStatusResponse;
import com.f106.DIO.user.service.UserTermsUpdateService;
import com.f106.DIO.user.service.UserTermsQueryService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/v1/me/terms")
@Tag(name="회원")
@SecurityRequirement(name="bearerAuth")
public class UserTermsController {
    private final UserTermsUpdateService service;
    private final UserTermsQueryService queries;
    public UserTermsController(UserTermsUpdateService service, UserTermsQueryService queries){
        this.service=service;this.queries=queries;
    }
    @GetMapping
    @Operation(summary="마케팅 선택 약관 동의 조회",description="로그인한 본인의 MARKETING_PRIVACY·AD_EMAIL·AD_PUSH·AD_NIGHT_PUSH 4개 항목을 반환합니다. termsVersion은 PUT과 동일한 현재 설정 버전입니다. 현재 버전 기록은 동의·철회 상태와 agreedAt을 반환합니다. 기록 없음(NOT_RECORDED) 또는 구버전만 있음(PREVIOUS_VERSION_ONLY)은 agreed=false·agreedAt=null이며 자동 동의·기록 생성 없이 구분합니다. CURRENT_VERSION은 해당 버전 기록이 있다는 의미이며 동의 여부는 agreed로 판단합니다. 기존 MARKETING은 새 항목으로 전환하지 않습니다.")
    @ApiResponse(responseCode="200",description="현재 버전 기준 선택 약관 상태 4개")
    @ApiResponse(responseCode="401",description="로그인 필요·만료·폐기·비활성 회원")
    public ResponseEntity<TermsStatusResponse> current(@AuthenticationPrincipal Jwt jwt){
        return ResponseEntity.ok().header("Cache-Control","no-store")
            .body(queries.current(Long.parseLong(jwt.getSubject())));
    }
    @PutMapping("/{termsType}/{termsVersion}")
    @Operation(summary="약관 동의 변경",description="로그인한 본인의 현재 버전 동의를 저장합니다. SERVICE·PRIVACY는 true만, MARKETING_PRIVACY·AD_EMAIL·AD_PUSH·AD_NIGHT_PUSH는 각각 선택 동의·철회 가능합니다. 기존 MARKETING 기록은 새 항목으로 자동 전환하지 않습니다. 같은 상태 재요청은 기존 시각을 유지합니다. agreedAt은 마지막 동의 상태 변경 시각이며 버전별 이전 행은 보존합니다.")
    @ApiResponse(responseCode="200",description="저장된 동의 상태")
    @ApiResponse(responseCode="400",description="약관 종류·버전·동의 값 오류 또는 필수 동의 철회")
    @ApiResponse(responseCode="401",description="로그인 필요·만료·폐기·비활성 회원")
    public ResponseEntity<TermsUpdateResponse> update(@AuthenticationPrincipal Jwt jwt,@PathVariable TermsType termsType,
        @PathVariable String termsVersion,@Valid @RequestBody TermsUpdateRequest request){
        return ResponseEntity.ok().header("Cache-Control","no-store")
            .body(service.update(Long.parseLong(jwt.getSubject()),termsType,termsVersion,request.agreed()));
    }
}
