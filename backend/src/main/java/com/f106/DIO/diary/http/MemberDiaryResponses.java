package com.f106.DIO.diary.http;

import java.time.Instant;
import java.util.List;
import com.f106.DIO.diary.dto.DiaryCreateResponse.DiaryData;
import io.swagger.v3.oas.annotations.media.Schema;

public final class MemberDiaryResponses {
    private MemberDiaryResponses() {}
    public record Diary(
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED,format="uuid") String diaryId,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) String diaryTitle,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) String coverColor,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) String coverStyle,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) String visibility,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) Instant createdAt,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) Instant updatedAt,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) boolean canEdit,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED,type="string",pattern="^[1-9][0-9]{0,18}$",description="양의 BIGINT 문자열") String version,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) String myRole,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) Membership myMembership,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) Permissions permissions,
        tools.jackson.databind.JsonNode cover,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
        tools.jackson.databind.JsonNode paperAppearance
    ) {
        public Diary(String id,String title,String color,String style,String visibility,Instant created,Instant updated,boolean canEdit,String version,String role,Membership membership,Permissions permissions) {
            this(id,title,color,style,visibility,created,updated,canEdit,version,role,membership,permissions,null,null);
        }
        public Diary withCover(tools.jackson.databind.JsonNode value) {
            return new Diary(diaryId,diaryTitle,coverColor,coverStyle,visibility,createdAt,updatedAt,canEdit,version,myRole,myMembership,permissions,value,paperAppearance);
        }
        public Diary withPaperAppearance(tools.jackson.databind.JsonNode value) {
            return new Diary(diaryId,diaryTitle,coverColor,coverStyle,visibility,createdAt,updatedAt,canEdit,version,myRole,myMembership,permissions,cover,value);
        }
        public Diary(String id,String title,String color,String style,String visibility,Instant created,Instant updated,boolean canEdit) {
            this(id,title,color,style,visibility,created,updated,canEdit,"1",canEdit?"OWNER":"EDITOR",new Membership(false),new Permissions(canEdit,true,canEdit,false,false));
        }
        static Diary from(DiaryData d,boolean canEdit) { return from(d,canEdit,"1",canEdit?"OWNER":"EDITOR",false); }
        static Diary from(DiaryData d,boolean canEdit,String version,String role,boolean favorite) { return new Diary(d.diaryId(),d.diaryTitle(),d.coverColor(),d.coverStyle(),d.visibility(),d.createdAt(),d.updatedAt(),canEdit,version,role,new Membership(favorite),new Permissions(canEdit,true,canEdit,false,false)); }
    }
    public record Membership(@Schema(requiredMode=Schema.RequiredMode.REQUIRED) boolean isFavorite) {}
    public record Permissions(@Schema(requiredMode=Schema.RequiredMode.REQUIRED) boolean canEditMetadata,@Schema(requiredMode=Schema.RequiredMode.REQUIRED) boolean canEditCanvas,@Schema(requiredMode=Schema.RequiredMode.REQUIRED) boolean canTrash,@Schema(requiredMode=Schema.RequiredMode.REQUIRED) boolean canRestore,@Schema(requiredMode=Schema.RequiredMode.REQUIRED) boolean canPermanentlyDelete) {}
    public record Detail(@Schema(requiredMode=Schema.RequiredMode.REQUIRED) Diary diary) {}
    public record Created(@Schema(requiredMode=Schema.RequiredMode.REQUIRED) Diary diary,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED,format="uuid") String firstPageId,
        @Schema(requiredMode=Schema.RequiredMode.REQUIRED) List<String> pageIds) {}
}
