package com.f106.DIO.tape;

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
    "spring.datasource.url=jdbc:h2:mem:tape-library;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "dio.auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "dio.signup.photos.storage=local", "dio.signup.photos.local-directory=build/test-tape-photos",
    "SHARING_INVITE_SECRET=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
    "SHARING_INVITE_BASE_URL=https://dio.test/invite/"})
@AutoConfigureMockMvc @ActiveProfiles("test")
class TapeLibraryTests {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired EmailAuthProviderRepository accounts;
    @Autowired EmailLoginService login;
    @Autowired JdbcTemplate jdbc;
    @Autowired com.f106.DIO.user.repository.UserWithdrawalDataRepository withdrawal;
    record Actor(long id, String token) {}

    // 탈퇴 정리 · 미디어 참조 검사가 보는 표 중 기본 H2 스키마(엔티티)에 없는 것만 만든다(StickerLibraryTests 와 같은 방법)
    @org.junit.jupiter.api.BeforeEach void missingTables() {
        jdbc.execute("create table if not exists notifications(user_id bigint)");
        jdbc.execute("create table if not exists diary_handwriting_fonts(font_media_file_id uuid, granted_by_user_id bigint)");
        jdbc.execute("create table if not exists ai_jobs(source_media_file_id uuid, result_media_file_id uuid)");
        jdbc.execute("alter table media_files add column if not exists source_media_file_id uuid");
        jdbc.execute("alter table diary_members add column if not exists member_profile_photo_id uuid");
        jdbc.execute("create table if not exists canvas_history_operations(page_id uuid, before_state_json varchar, after_state_json varchar)");
    }

    Actor actor() {
        var user = users.saveAndFlush(new User(UUID.randomUUID() + "@example.com", "테이프", Instant.now()));
        accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(), user.getEmail(), new BCryptPasswordEncoder(4).encode("DioMember123!"), Instant.now()));
        return new Actor(user.getUserId(), login.login(new LoginRequest(user.getEmail(), "DioMember123!", "tape-test"), "127.0.0.1").accessToken());
    }
    UUID image(long owner) { return media(owner, "IMAGE"); }
    UUID media(long owner, String type) {
        var id = UUID.randomUUID();
        jdbc.update("insert into media_files(media_file_id,owner_user_id,media_type,source_type,library_category,storage_key,mime_type,file_size,status,created_at) values(?,?,?,'UPLOAD','TAPE',?,'image/png',1,'READY',?)",
            id, owner, type, "test/" + id, java.sql.Timestamp.from(Instant.now()));
        return id;
    }
    String body(long expected, String folders) { return "{\"expectedVersion\":" + expected + ",\"folders\":" + folders + "}"; }
    String photoTape(UUID media) {
        return "{\"id\":\"t1\",\"mediaFileId\":\"" + media + "\",\"name\":\"테이프 1\",\"imageWidth\":1200,\"imageHeight\":800,"
            + "\"crop\":{\"fx\":0.25,\"fy\":0.5,\"zoom\":2},\"size\":\"standard\",\"pieceRatio\":5.29}";
    }
    org.springframework.test.web.servlet.ResultActions put(Actor actor, String body) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/me/tape-library")
            .header("Authorization", "Bearer " + actor.token()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test void emptyLibraryThenSaveAndReadBackOnAnotherDevice() throws Exception {
        var actor = actor();
        var tape = image(actor.id());
        mvc.perform(get("/api/v1/me/tape-library").header("Authorization", "Bearer " + actor.token()))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("version").value(0)).andExpect(jsonPath("folders.length()").value(0));
        put(actor, body(0, "[{\"id\":\"f1\",\"name\":\"내 테이프\",\"items\":[" + photoTape(tape) + ",{\"pattern\":\"dots\",\"palette\":\"mint\"}]},{\"id\":\"f2\",\"name\":\"빈 폴더\",\"items\":[]}]"))
            .andExpect(status().isOk()).andExpect(jsonPath("version").value(1));
        // 다른 기기(같은 계정, 새 로그인)에서 자른 자리까지 같은 구성으로 받는다
        var otherDevice = new Actor(actor.id(), login.login(new LoginRequest(users.findById(actor.id()).orElseThrow().getEmail(), "DioMember123!", "tape-test-2"), "127.0.0.1").accessToken());
        mvc.perform(get("/api/v1/me/tape-library").header("Authorization", "Bearer " + otherDevice.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("version").value(1))
            .andExpect(jsonPath("folders[0].name").value("내 테이프"))
            .andExpect(jsonPath("folders[0].items[0].id").value("t1"))
            .andExpect(jsonPath("folders[0].items[0].mediaFileId").value(tape.toString()))
            .andExpect(jsonPath("folders[0].items[0].crop.fx").value(0.25))
            .andExpect(jsonPath("folders[0].items[0].crop.zoom").value(2.0))
            .andExpect(jsonPath("folders[0].items[0].size").value("standard"))
            .andExpect(jsonPath("folders[0].items[0].pieceRatio").value(5.29))
            .andExpect(jsonPath("folders[0].items[1].pattern").value("dots"))
            .andExpect(jsonPath("folders[1].items.length()").value(0));
        assertThat(jdbc.queryForList("select media_file_id from user_tape_library_media where user_id=?", UUID.class, actor.id())).containsExactly(tape);
        // 스티커 보관함과는 따로 저장된다
        mvc.perform(get("/api/v1/me/sticker-library").header("Authorization", "Bearer " + actor.token())).andExpect(jsonPath("version").value(0));
    }

    @Test void staleVersionIsRejectedSoAnotherDevicesChangeIsNotOverwritten() throws Exception {
        var actor = actor();
        put(actor, body(0, "[{\"id\":\"a\",\"name\":\"A\",\"items\":[]}]")).andExpect(status().isOk());
        put(actor, body(1, "[{\"id\":\"b\",\"name\":\"B\",\"items\":[]}]")).andExpect(status().isOk()).andExpect(jsonPath("version").value(2));
        put(actor, body(1, "[]")).andExpect(status().isConflict()).andExpect(jsonPath("code").value("TAPE_LIBRARY_CONFLICT"));
        mvc.perform(get("/api/v1/me/tape-library").header("Authorization", "Bearer " + actor.token()))
            .andExpect(jsonPath("version").value(2)).andExpect(jsonPath("folders[0].id").value("b"));
    }

    @Test void onlyMyOwnImagesCanBeStored() throws Exception {
        var actor = actor(); var other = actor();
        put(actor, body(0, "[{\"id\":\"a\",\"name\":\"A\",\"items\":[{\"mediaFileId\":\"" + image(other.id()) + "\"}]}]"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("TAPE_MEDIA_NOT_FOUND"));
        put(actor, body(0, "[{\"id\":\"a\",\"name\":\"A\",\"items\":[{\"mediaFileId\":\"" + media(actor.id(), "FONT") + "\"}]}]"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("TAPE_MEDIA_NOT_FOUND"));
    }

    @Test void malformedLibrariesAreRejected() throws Exception {
        var actor = actor();
        for (String folders : new String[] {
            "[{\"id\":\"a\",\"name\":\"A\"},{\"id\":\"a\",\"name\":\"B\"}]", // 같은 폴더 id
            "[{\"id\":\"a\",\"name\":\" \"}]", // 빈 이름
            "[{\"id\":\"a\",\"name\":\"A\",\"items\":[{\"name\":\"이름만\"}]}]", // 무엇인지 없는 테이프
            "[{\"id\":\"a\",\"name\":\"A\",\"items\":[{\"id\":\"../x\",\"pattern\":\"dots\"}]}]", // 테이프 id 형식
            "[{\"id\":\"a\",\"name\":\"A\",\"items\":[{\"pattern\":\"dots\",\"crop\":{\"fx\":2,\"fy\":0.5,\"zoom\":1}}]}]", // 자른 자리
            "[{\"id\":\"a\",\"name\":\"A\",\"items\":[{\"pattern\":\"dots\",\"crop\":{\"fx\":0.5,\"fy\":0.5}}]}]", // 확대 없음
            "[{\"id\":\"a\",\"name\":\"A\",\"items\":[{\"pattern\":\"dots\",\"pieceRatio\":0}]}]", // 조각 비율
        }) put(actor, body(0, folders)).andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("INVALID_TAPE_LIBRARY"));
        mvc.perform(get("/api/v1/me/tape-library")).andExpect(status().isUnauthorized());
    }

    @Test void libraryImagesAreReferencesAndWithdrawalErasesTheLibrary() throws Exception {
        var actor = actor();
        var tape = image(actor.id());
        put(actor, body(0, "[{\"id\":\"a\",\"name\":\"A\",\"items\":[{\"mediaFileId\":\"" + tape + "\"}]}]")).andExpect(status().isOk());
        jdbc.update("update media_files set deleted_at=? where media_file_id=?", java.sql.Timestamp.from(Instant.parse("2020-01-01T00:00:00Z")), tape);
        String unreferenced = com.f106.DIO.media.repository.MediaReferenceSql.H2_UNREFERENCED;
        assertThat(jdbc.queryForObject("select count(*) from media_files where media_file_id=? " + unreferenced, Integer.class, tape)).isZero();
        jdbc.update("update media_files set deleted_at=null where media_file_id=?", tape);
        withdrawal.erasePrivate(actor.id(), Instant.now());
        assertThat(jdbc.queryForObject("select count(*) from user_tape_libraries where user_id=?", Integer.class, actor.id())).isZero();
        assertThat(jdbc.queryForObject("select count(*) from user_tape_library_media where user_id=?", Integer.class, actor.id())).isZero();
        assertThat(jdbc.queryForObject("select deleted_at from media_files where media_file_id=?", java.sql.Timestamp.class, tape)).isNotNull();
    }
}
