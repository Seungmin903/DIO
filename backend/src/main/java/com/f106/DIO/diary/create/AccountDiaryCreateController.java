package com.f106.DIO.diary.create;

import java.net.URI;
import java.security.Principal;
import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.*;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import com.f106.DIO.diary.read.DiaryReadController;

@RestController
@RequestMapping("/api/v1/diaries")
@SecurityRequirement(name="bearerAuth")
public class AccountDiaryCreateController {
    private final AccountDiaryCreationService service;
    public AccountDiaryCreateController(AccountDiaryCreationService service){this.service=service;}
    @PostMapping
    @Operation(summary="개인 다이어리와 첫 페이지 생성",description="OWNER 멤버십과 무지 1장을 원자 생성합니다. Idempotency-Key는 UUID이며 같은 입력의 201 응답은 24시간 재사용합니다. 만료된 키는 409입니다.")
    @ApiResponse(responseCode="201",description="생성 또는 동일 요청 재사용",content=@Content(mediaType="application/json",schema=@Schema(implementation=AccountDiaryCreationService.Created.class)))
    @ApiResponse(responseCode="400",description="잘못된 입력·키")
    @ApiResponse(responseCode="401",description="로그인 필요")
    @ApiResponse(responseCode="409",description="키 충돌·만료 또는 생성 결과 접근 불가")
    public ResponseEntity<String> create(Principal principal,
                                        @io.swagger.v3.oas.annotations.Parameter(required=true, schema=@Schema(type="string",format="uuid"))
                                        @RequestHeader(name="Idempotency-Key",required=false) String key,
                                        @Valid @RequestBody AccountDiaryCreateRequest input) {
        var result=service.create(DiaryReadController.user(principal),key,input);
        return ResponseEntity.created(URI.create("/api/v1/diaries/"+result.diaryId())).contentType(MediaType.APPLICATION_JSON)
            .header("Cache-Control","no-store").body(result.body());
    }
}
