package com.f106.DIO.sharing.dto;
import com.fasterxml.jackson.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import java.util.UUID;
public class DiaryProfileUpdateRequest {
    private Boolean favorite;
    private UUID lastOpenedPageId;
    @Pattern(regexp="[가-힣a-zA-Z0-9_]{2,12}",message="별칭은 한글·영문·숫자·밑줄 2~12자로 입력해 주세요.")
    private String nickname;
    private UUID memberProfilePhotoId;
    @JsonIgnore private boolean nicknameProvided;
    @JsonIgnore private boolean photoProvided;
    public DiaryProfileUpdateRequest(){}
    public DiaryProfileUpdateRequest(Boolean favorite,UUID page){this.favorite=favorite;lastOpenedPageId=page;}
    public Boolean getFavorite(){return favorite;}
    public void setFavorite(Boolean value){favorite=value;}
    public UUID getLastOpenedPageId(){return lastOpenedPageId;}
    public void setLastOpenedPageId(UUID value){lastOpenedPageId=value;}
    @Schema(description="다이어리 별칭. 중복 허용. null은 계정 닉네임으로 복원",example="여행친구")
    public String getNickname(){return nickname;}
    @JsonSetter("nickname") public void setNickname(String value){nicknameProvided=true;nickname=value==null?null:java.text.Normalizer.normalize(value.strip(),java.text.Normalizer.Form.NFKC);}
    @Schema(description="프로필 업로드로 등록한 내 미디어 ID. null은 계정 사진으로 복원")
    public UUID getMemberProfilePhotoId(){return memberProfilePhotoId;}
    @JsonSetter("memberProfilePhotoId") public void setMemberProfilePhotoId(UUID value){photoProvided=true;memberProfilePhotoId=value;}
    @JsonIgnore @Schema(hidden=true) public boolean isNicknameProvided(){return nicknameProvided;}
    @JsonIgnore @Schema(hidden=true) public boolean isPhotoProvided(){return photoProvided;}
    public boolean hasUpdates(){return favorite!=null||lastOpenedPageId!=null||nicknameProvided||photoProvided;}
}
