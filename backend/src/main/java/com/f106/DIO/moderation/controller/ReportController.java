package com.f106.DIO.moderation.controller;
import com.f106.DIO.moderation.service.ReportService;import com.f106.DIO.moderation.dto.*;import com.f106.DIO.sharing.support.SharingActor;
import org.springframework.web.bind.annotation.*;import org.springframework.security.core.annotation.AuthenticationPrincipal;import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.*;import org.springframework.web.multipart.MultipartFile;import jakarta.validation.Valid;import java.util.List;
import io.swagger.v3.oas.annotations.Operation;import io.swagger.v3.oas.annotations.security.SecurityRequirement;
@RestController @RequestMapping("/api/v1/reports") @SecurityRequirement(name="bearerAuth")
public class ReportController {
 private final ReportService service;public ReportController(ReportService service){this.service=service;}
 @PostMapping(consumes=MediaType.MULTIPART_FORM_DATA_VALUE) @Operation(summary="공유 다이어리 사용자 신고",description="사진 선택: PNG/JPEG 최대 3장, 장당 5MiB. 신고만으로 자동 차단·제재하지 않음. 메일 실패와 무관하게 접수 유지.")
 public ResponseEntity<ReportResponse> submit(@AuthenticationPrincipal Jwt jwt,@Valid @RequestPart("report") ReportRequest request,@RequestPart(value="evidenceFiles",required=false) List<MultipartFile> files){
  var result=service.submit(SharingActor.require(jwt),request,files);return ResponseEntity.status(result.created()?201:200).cacheControl(CacheControl.noStore()).body(result.response());
 }
}
