package com.f106.DIO.sharing.controller;
import com.f106.DIO.sharing.dto.*;
import com.f106.DIO.sharing.service.*;
import com.f106.DIO.sharing.support.SharingActor;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.UUID;
@RestController @RequestMapping("/api/v1/diaries/{diaryId}")
@SecurityRequirement(name="bearerAuth")
@io.swagger.v3.oas.annotations.tags.Tag(name="공유 다이어리")
public class DiaryProfileController {
    private final DiaryProfileService profiles;private final DiaryMemberPhotoService photos;
    public DiaryProfileController(DiaryProfileService profiles,DiaryMemberPhotoService photos){this.profiles=profiles;this.photos=photos;}
    @PatchMapping(value="/profile",consumes=MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary="내 다이어리 상태·프로필 수정",description="별칭 중복 허용. 생략은 유지, nickname:null은 계정 닉네임, memberProfilePhotoId:null은 계정 사진 사용. 커서 색은 변경하지 않음.",
        requestBody=@io.swagger.v3.oas.annotations.parameters.RequestBody(content=@io.swagger.v3.oas.annotations.media.Content(
            mediaType=MediaType.APPLICATION_JSON_VALUE,examples=@io.swagger.v3.oas.annotations.media.ExampleObject(value="{\"nickname\":\"여행친구\",\"favorite\":true}"))))
    public DiaryProfileResponse update(@PathVariable UUID diaryId,@AuthenticationPrincipal Jwt jwt,@RequestBody DiaryProfileUpdateRequest request){return profiles.update(diaryId,SharingActor.require(jwt),request,null);}
    @PatchMapping(value="/profile",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary="내 다이어리 상태·프로필 수정",description="profile JSON 파트와 photo 파일 파트. JPEG/PNG 최대 5MB. 사진은 S3/로컬에, 참조는 기존 media_files에 저장. 사진 업로드와 사진 ID 선택은 동시에 전달하지 않음.",
        requestBody=@io.swagger.v3.oas.annotations.parameters.RequestBody(content=@io.swagger.v3.oas.annotations.media.Content(
            mediaType=MediaType.MULTIPART_FORM_DATA_VALUE,encoding=@io.swagger.v3.oas.annotations.media.Encoding(name="profile",contentType=MediaType.APPLICATION_JSON_VALUE))))
    public DiaryProfileResponse upload(@PathVariable UUID diaryId,@AuthenticationPrincipal Jwt jwt,@RequestPart("profile") DiaryProfileUpdateRequest request,@RequestPart(value="photo",required=false) MultipartFile photo){return profiles.update(diaryId,SharingActor.require(jwt),request,photo);}
    @GetMapping(value="/members/{userId}/profile-photo",produces=MediaType.IMAGE_PNG_VALUE)
    @Operation(summary="다이어리 전용 프로필 사진 조회",description="현재 참여자만 접근 가능. 프로필 응답의 profilePhotoUrl로 조회하며 Bearer 인증 필요.")
    public ResponseEntity<byte[]> photo(@PathVariable UUID diaryId,@PathVariable long userId,@AuthenticationPrincipal Jwt jwt){
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).header("Cache-Control","no-store").header("X-Content-Type-Options","nosniff").body(photos.read(diaryId,SharingActor.require(jwt),userId));
    }
}
