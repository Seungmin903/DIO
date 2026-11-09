package com.f106.DIO.sticker;

import com.f106.DIO.auth.domain.EmailAuthProvider;
import com.f106.DIO.auth.dto.LoginRequest;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.auth.service.EmailLoginService;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@org.springframework.test.context.jdbc.Sql("/push-session-h2.sql")
@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:sticker-library;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "dio.auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "dio.signup.photos.storage=local", "dio.signup.photos.local-directory=build/test-sticker-photos",
    "SHARING_INVITE_SECRET=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
    "SHARING_INVITE_BASE_URL=https://dio.test/invite/"})
@AutoConfigureMockMvc @ActiveProfiles("test")
class StickerLibraryTests {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired EmailAuthProviderRepository accounts;
    @Autowired EmailLoginService login;
    @Autowired JdbcTemplate jdbc;
    @Autowired com.f106.DIO.user.repository.UserWithdrawalDataRepository withdrawal;
    record Actor(long id, String token) {}

    // 탈퇴 정리 · 미디어 참조 검사가 보는 표 중 기본 H2 스키마(엔티티)에 없는 것만 만든다(MemberDiaryPurgeHttpTests 와 같은 방법)
    @org.junit.jupiter.api.BeforeEach void missingTables() {
        jdbc.execute("create table if not exists notifications(user_id bigint)");
        jdbc.execute("create table if not exists diary_handwriting_fonts(font_media_file_id uuid, granted_by_user_id bigint)");
        jdbc.execute("create table if not exists ai_jobs(source_media_file_id uuid, result_media_file_id uuid)");
        jdbc.execute("alter table media_files add column if not exists source_media_file_id uuid");
        jdbc.execute("alter table diary_members add column if not exists member_profile_photo_id uuid");
        jdbc.execute("create table if not exists canvas_history_operations(page_id uuid, before_state_json varchar, after_state_json varchar)");
    }

    Actor actor() {
        var user = users.saveAndFlush(new User(UUID.randomUUID() + "@example.com", "스티커", Instant.now()));
        accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(), user.getEmail(), new BCryptPasswordEncoder(4).encode("DioMember123!"), Instant.now()));
        return new Actor(user.getUserId(), login.login(new LoginRequest(user.getEmail(), "DioMember123!", "sticker-test"), "127.0.0.1").accessToken());
    }
    UUID image(long owner) { return media(owner, "IMAGE"); }
    UUID media(long owner, String type) {
        var id = UUID.randomUUID();
        jdbc.update("insert into media_files(media_file_id,owner_user_id,media_type,source_type,library_category,storage_key,mime_type,file_size,status,created_at) values(?,?,?,'UPLOAD','STICKER',?,'image/png',1,'READY',?)",
            id, owner, type, "test/" + id, java.sql.Timestamp.from(Instant.now()));
        return id;
    }
    String body(long expected, String folders) { return "{\"expectedVersion\":" + expected + ",\"folders\":" + folders + "}"; }
    org.springframework.test.web.servlet.ResultActions put(Actor actor, String body) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/me/sticker-library")
            .header("Authorization", "Bearer " + actor.token()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test void emptyLibraryThenSaveAndReadBackOnAnotherDevice() throws Exception {
        var actor = actor();
        var sticker = image(actor.id());
        mvc.perform(get("/api/v1/me/sticker-library").header("Authorization", "Bearer " + actor.token()))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("version").value(0)).andExpect(jsonPath("folders.length()").value(0));
        put(actor, body(0, "[{\"id\":\"f1\",\"name\":\"여행\",\"items\":[{\"mediaFileId\":\"" + sticker + "\",\"name\":\"고양이\",\"aspect\":1.5},{\"builtin\":\"heart\"}]},{\"id\":\"f2\",\"name\":\"빈 폴더\",\"items\":[]}]"))
            .andExpect(status().isOk()).andExpect(jsonPath("version").value(1));
        // 다른 기기(같은 계정, 새 로그인)에서 같은 구성으로 받는다
        var otherDevice = new Actor(actor.id(), login.login(new LoginRequest(users.findById(actor.id()).orElseThrow().getEmail(), "DioMember123!", "sticker-test-2"), "127.0.0.1").accessToken());
        mvc.perform(get("/api/v1/me/sticker-library").header("Authorization", "Bearer " + otherDevice.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("version").value(1))
            .andExpect(jsonPath("folders[0].name").value("여행"))
            .andExpect(jsonPath("folders[0].items[0].mediaFileId").value(sticker.toString()))
            .andExpect(jsonPath("folders[0].items[0].aspect").value(1.5))
            .andExpect(jsonPath("folders[0].items[1].builtin").value("heart"))
            .andExpect(jsonPath("folders[1].items.length()").value(0));
        assertThat(jdbc.queryForList("select media_file_id from user_sticker_library_media where user_id=?", UUID.class, actor.id())).containsExactly(sticker);
    }

    @Test void staleVersionIsRejectedSoAnotherDevicesChangeIsNotOverwritten() throws Exception {
        var actor = actor();
        put(actor, body(0, "[{\"id\":\"a\",\"name\":\"A\",\"items\":[]}]")).andExpect(status().isOk());
        put(actor, body(1, "[{\"id\":\"b\",\"name\":\"B\",\"items\":[]}]")).andExpect(status().isOk()).andExpect(jsonPath("version").value(2));
        put(actor, body(1, "[]")).andExpect(status().isConflict()).andExpect(jsonPath("code").value("STICKER_LIBRARY_CONFLICT"));
        put(actor, body(0, "[]")).andExpect(status().isConflict());
        mvc.perform(get("/api/v1/me/sticker-library").header("Authorization", "Bearer " + actor.token()))
            .andExpect(jsonPath("version").value(2)).andExpect(jsonPath("folders[0].id").value("b"));
    }

    @Test void onlyMyOwnImagesCanBeStored() throws Exception {
        var actor = actor(); var other = actor();
        var someoneElses = image(other.id());
        put(actor, body(0, "[{\"id\":\"a\",\"name\":\"A\",\"items\":[{\"mediaFileId\":\"" + someoneElses + "\"}]}]"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("STICKER_MEDIA_NOT_FOUND"));
        var font = media(actor.id(), "FONT");
        put(actor, body(0, "[{\"id\":\"a\",\"name\":\"A\",\"items\":[{\"mediaFileId\":\"" + font + "\"}]}]"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("STICKER_MEDIA_NOT_FOUND"));
        // 다른 사람의 보관함은 바뀌지 않는다
        mvc.perform(get("/api/v1/me/sticker-library").header("Authorization", "Bearer " + other.token())).andExpect(jsonPath("version").value(0));
    }

    @Test void keptImagesMayStayAfterBeingDeletedFromMediaButNewOnesMustBeLive() throws Exception {
        var actor = actor();
        var kept = image(actor.id()); var fresh = image(actor.id());
        put(actor, body(0, "[{\"id\":\"a\",\"name\":\"A\",\"items\":[{\"mediaFileId\":\"" + kept + "\"}]}]")).andExpect(status().isOk());
        jdbc.update("update media_files set deleted_at=? where media_file_id in (?,?)", java.sql.Timestamp.from(Instant.now()), kept, fresh);
        put(actor, body(1, "[{\"id\":\"a\",\"name\":\"B\",\"items\":[{\"mediaFileId\":\"" + kept + "\"}]}]")).andExpect(status().isOk());
        put(actor, body(2, "[{\"id\":\"a\",\"name\":\"B\",\"items\":[{\"mediaFileId\":\"" + kept + "\"},{\"mediaFileId\":\"" + fresh + "\"}]}]"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("STICKER_MEDIA_NOT_FOUND"));
    }

    @Test void malformedLibrariesAreRejected() throws Exception {
        var actor = actor();
        for (String folders : new String[] {
            "[{\"id\":\"a\",\"name\":\"A\"},{\"id\":\"a\",\"name\":\"B\"}]", // 같은 폴더 id
            "[{\"id\":\"../x\",\"name\":\"A\"}]", // id 형식
            "[{\"id\":\"a\",\"name\":\" \"}]", // 빈 이름
            "[{\"id\":\"a\",\"name\":\"" + "가".repeat(41) + "\"}]", // 이름 41자
            "[{\"id\":\"a\",\"name\":\"A\",\"items\":[{\"name\":\"이름만\"}]}]", // 무엇인지 없는 스티커
            "[{\"id\":\"a\",\"name\":\"A\",\"items\":[{\"builtin\":\"x\",\"aspect\":0}]}]", // 비율
        }) put(actor, body(0, folders)).andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("INVALID_STICKER_LIBRARY"));
        put(actor, "{\"folders\":[]}").andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/me/sticker-library")).andExpect(status().isUnauthorized());
    }

    @Test void libraryImagesAreReferencesAndWithdrawalErasesTheLibrary() throws Exception {
        var actor = actor();
        var sticker = image(actor.id());
        put(actor, body(0, "[{\"id\":\"a\",\"name\":\"A\",\"items\":[{\"mediaFileId\":\"" + sticker + "\"}]}]")).andExpect(status().isOk());
        // 탈퇴 정리: 참조 없는 개인 파일만 삭제 표시하는데, 먼저 보관함을 지우므로 보관함 스티커도 정리 대상이 된다
        withdrawal.erasePrivate(actor.id(), Instant.now());
        assertThat(jdbc.queryForObject("select count(*) from user_sticker_libraries where user_id=?", Integer.class, actor.id())).isZero();
        assertThat(jdbc.queryForObject("select count(*) from user_sticker_library_media where user_id=?", Integer.class, actor.id())).isZero();
        assertThat(jdbc.queryForObject("select deleted_at from media_files where media_file_id=?", java.sql.Timestamp.class, sticker)).isNotNull();
    }

    @Test void stickersStillInALibraryAreNotPhysicallyDeletable() throws Exception {
        var actor = actor();
        var sticker = image(actor.id());
        put(actor, body(0, "[{\"id\":\"a\",\"name\":\"A\",\"items\":[{\"mediaFileId\":\"" + sticker + "\"}]}]")).andExpect(status().isOk());
        jdbc.update("update media_files set deleted_at=? where media_file_id=?", java.sql.Timestamp.from(Instant.parse("2020-01-01T00:00:00Z")), sticker);
        String unreferenced = com.f106.DIO.media.repository.MediaReferenceSql.H2_UNREFERENCED;
        assertThat(jdbc.queryForObject("select count(*) from media_files where media_file_id=? " + unreferenced, Integer.class, sticker)).isZero();
        put(actor, body(1, "[]")).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from media_files where media_file_id=? " + unreferenced, Integer.class, sticker)).isOne();
    }
}
