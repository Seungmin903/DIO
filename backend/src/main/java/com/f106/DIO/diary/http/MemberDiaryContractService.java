package com.f106.DIO.diary.http;

import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.context.ApplicationEventPublisher;
import com.f106.DIO.diary.detail.*;
import com.f106.DIO.diary.auth.DiaryRequestIdentity;
import com.f106.DIO.page.domain.PaperAppearance;
import com.f106.DIO.page.domain.PageCatalogChanged;
import com.f106.DIO.page.service.PageService;

/** Keep authorization, version check and DTO enrichment in the same locked transaction. */
@Service
@Transactional
public class MemberDiaryContractService {
    private final DiaryDetailService detail;
    private final JdbcTemplate jdbc;
    private final DiaryRequestIdentity identity;
    private final DiaryDetailRepository diaries;
    private final PageService pages;
    private final ApplicationEventPublisher events;
    public MemberDiaryContractService(DiaryDetailService detail, JdbcTemplate jdbc, DiaryRequestIdentity identity, DiaryDetailRepository diaries, PageService pages, ApplicationEventPublisher events) {
        this.detail=detail; this.jdbc=jdbc; this.identity=identity; this.diaries=diaries; this.pages=pages; this.events=events;
    }
    public MemberDiaryResponses.Diary get(UUID id) {
        return enrich(id,detail.getAuthorized(id));
    }
    public MemberDiaryResponses.Diary update(UUID id,MemberDiaryRequests.Update request) {
        // Authorized get holds shared locks; acquire the diary write lock first to avoid lock upgrades.
        long user=identity.requireUserId(DiaryDetailException::unauthorized);
        // SHARE prevents account revocation without serializing this user's unrelated diaries.
        // Keep user -> diary UPDATE -> membership SHARE; do not acquire membership locks first.
        if(!diaries.lockActiveUser(user)) throw DiaryDetailException.unauthorized();
        // A non-locking rejection check avoids waiting on or locking another owner's diary.
        // This is not authorization: getAuthorized below rechecks under the existing locks.
        var roles=jdbc.queryForList("select m.role from diaries d join diary_members m on m.diary_id=d.diary_id"
            + " where d.diary_id=? and d.deleted_at is null and m.user_id=? and m.left_at is null"
            + " and ((m.role='OWNER' and d.owner_user_id=m.user_id) or (m.role='EDITOR' and d.owner_user_id<>m.user_id))",
            String.class,id,user);
        if(roles.isEmpty()) throw DiaryDetailException.notFound();
        if(!"OWNER".equals(roles.get(0))) throw new DiaryDetailException(HttpStatus.FORBIDDEN,"DIARY_METADATA_FORBIDDEN","소유자만 제목과 표지를 수정할 수 있어요.");
        jdbc.queryForList("select diary_id from diaries where diary_id=? for update",UUID.class,id);
        var before=detail.getAuthorized(id);
        if(!before.canEdit()) throw new DiaryDetailException(HttpStatus.FORBIDDEN,"DIARY_METADATA_FORBIDDEN","소유자만 제목과 표지를 수정할 수 있어요.");
        long current=jdbc.queryForObject("select version from diaries where diary_id=?",Long.class,id);
        if(!Long.toString(current).equals(request.getExpectedVersion())) throw new DiaryDetailException(HttpStatus.CONFLICT,"DIARY_METADATA_CONFLICT","최신 내용을 확인한 뒤 다시 시도해 주세요.");
        var patch=request.patch();var previous=before.diary();
        String title=patch.getDiaryTitle()==null?previous.diaryTitle():patch.getDiaryTitle();
        String color=patch.getCoverColor()==null?previous.coverColor():patch.getCoverColor();
        String style=patch.getCoverStyle()==null?previous.coverStyle():patch.getCoverStyle();
        String oldCover=jdbc.queryForObject("select cover_json from diaries where diary_id=?",String.class,id);
        String cover=oldCover;
        if(request.getCover()!=null)try {cover=DiaryCoverDesign.prepare(request.getCover(),DiaryCoverDesign.read(oldCover),user,jdbc);}
        catch(IllegalArgumentException error) {throw new DiaryDetailException(HttpStatus.BAD_REQUEST,"INVALID_DIARY_COVER","표지 자료를 확인해 주세요.");}
        String oldAppearance=jdbc.queryForObject("select paper_appearance_json from diaries where diary_id=?",String.class,id);
        var appearance=MemberDiaryRequests.normalizePaperAppearance(request.getPaperAppearance());
        String paper=appearance==null?oldAppearance:appearance.toString();
        String oldTemplate=jdbc.queryForObject("select template_config_json from diaries where diary_id=?",String.class,id);
        String requestedTemplate=MemberDiaryRequests.serializeTemplateConfig(request.getTemplateConfig());
        // 같은 구성을 다시 보내면 바뀐 것이 없다. 저장 문자열이 아닌 JSON 값으로 비교한다.
        // 저장 값이 깨졌으면 null로 읽혀 요청과 다르다고 보고, 검증을 거친 요청 값(requestedTemplate)으로 바꾼다. 읽은 값을 다시 저장하지 않는다.
        String template=requestedTemplate==null||java.util.Objects.equals(com.f106.DIO.diary.support.DiaryTemplateConfig.readLenient(oldTemplate,id),request.getTemplateConfig())?oldTemplate:requestedTemplate;
        boolean allPages=appearance!=null&&"all".equals(request.getPaperAppearanceScope());
        if(title.equals(previous.diaryTitle()) && color.equals(previous.coverColor()) && style.equals(previous.coverStyle())
            && java.util.Objects.equals(cover,oldCover) && java.util.Objects.equals(paper,oldAppearance) && java.util.Objects.equals(template,oldTemplate) && !allPages) return enrich(id,before);
        if(current==Long.MAX_VALUE) throw new DiaryDetailException(HttpStatus.CONFLICT,"VERSION_EXHAUSTED","다이어리 버전을 더 갱신할 수 없어요.");
        var now=java.time.Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        if(!now.isAfter(previous.updatedAt())) now=previous.updatedAt().plus(1,java.time.temporal.ChronoUnit.MICROS);
        int changed=jdbc.update("update diaries set title=?,cover_color=?,cover_style=?,cover_json=?,paper_appearance_json=?,template_config_json=?,updated_at=?,version=version+1 where diary_id=? and version=? and deleted_at is null",
            title,color,style,cover,paper,template,java.sql.Timestamp.from(now),id,current);
        if(changed!=1) throw new DiaryDetailException(HttpStatus.CONFLICT,"DIARY_METADATA_CONFLICT","최신 내용을 확인한 뒤 다시 시도해 주세요.");
        if(allPages)pages.updatePaperAppearanceForAll(id,appearance);
        else if(appearance!=null)events.publishEvent(new PageCatalogChanged(id));
        return enrich(id,detail.getAuthorized(id));
    }
    private MemberDiaryResponses.Diary enrich(UUID id,DiaryDetailService.Authorized authorized) {
        long user=identity.requireUserId(DiaryDetailException::unauthorized);
        return jdbc.queryForObject("select d.version,d.cover_json,d.paper_appearance_json,d.template_config_json,m.role,m.is_favorite from diaries d join diary_members m on m.diary_id=d.diary_id and m.user_id=? where d.diary_id=?",
            (rs,n)->MemberDiaryResponses.Diary.from(authorized.diary(),authorized.canEdit(),Long.toString(rs.getLong("version")),rs.getString("role"),rs.getBoolean("is_favorite"))
                .withCover(DiaryCoverDesign.read(rs.getString("cover_json")))
                .withPaperAppearance(PaperAppearance.read(rs.getString("paper_appearance_json")))
                .withTemplateConfig(com.f106.DIO.diary.support.DiaryTemplateConfig.readLenient(rs.getString("template_config_json"),id)),user,id);
    }
}
