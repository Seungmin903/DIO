package com.f106.DIO.paper;

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
    "spring.datasource.url=jdbc:h2:mem:paper-library;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "dio.auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "dio.signup.photos.storage=local", "dio.signup.photos.local-directory=build/test-paper-photos",
    "SHARING_INVITE_SECRET=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
    "SHARING_INVITE_BASE_URL=https://dio.test/invite/"})
@AutoConfigureMockMvc @ActiveProfiles("test")
class PaperLibraryTests {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired EmailAuthProviderRepository accounts;
    @Autowired EmailLoginService login;
    @Autowired JdbcTemplate jdbc;
    @Autowired com.f106.DIO.user.repository.UserWithdrawalDataRepository withdrawal;
    record Actor(long id, String token) {}

    // 탈퇴 정리 · 미디어 참조 검사가 보는 표 중 기본 H2 스키마(엔티티)에 없는 것만 만든다(TapeLibraryTests 와 같은 방법)
    @org.junit.jupiter.api.BeforeEach void missingTables() {
        jdbc.execute("create table if not exists notifications(user_id bigint)");
        jdbc.execute("create table if not exists diary_handwriting_fonts(font_media_file_id uuid, granted_by_user_id bigint)");
        jdbc.execute("create table if not exists ai_jobs(source_media_file_id uuid, result_media_file_id uuid)");
        jdbc.execute("alter table media_files add column if not exists source_media_file_id uuid");
        jdbc.execute("alter table diary_members add column if not exists member_profile_photo_id uuid");
        jdbc.execute("create table if not exists canvas_history_operations(page_id uuid, before_state_json varchar, after_state_json varchar)");
    }

    Actor actor() {
        var user = users.saveAndFlush(new User(UUID.randomUUID() + "@example.com", "속지", Instant.now()));
        accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(), user.getEmail(), new BCryptPasswordEncoder(4).encode("DioMember123!"), Instant.now()));
        return new Actor(user.getUserId(), login.login(new LoginRequest(user.getEmail(), "DioMember123!", "paper-test"), "127.0.0.1").accessToken());
    }
    UUID image(long owner) { return media(owner, "IMAGE"); }
    UUID media(long owner, String type) {
        var id = UUID.randomUUID();
        jdbc.update("insert into media_files(media_file_id,owner_user_id,media_type,source_type,library_category,storage_key,mime_type,file_size,status,created_at) values(?,?,?,'UPLOAD','PHOTO',?,'image/png',1,'READY',?)",
            id, owner, type, "test/" + id, java.sql.Timestamp.from(Instant.now()));
        return id;
    }
    String body(long expected, String papers, String style) { return "{\"expectedVersion\":" + expected + ",\"papers\":" + papers + ",\"style\":" + style + "}"; }
    // 공방에서 PDF 로 만든 속지 묶음(앱 myLibrary.normalizeMyPapers 모양에서 기기 전용 칸 src · pdfSource 를 뺀 것)
    String paper(String id, UUID... pages) {
        var list = new java.util.StringJoiner(",", "[", "]");
        for (int n = 0; n < pages.length; n++) list.add("{\"mediaFileId\":\"" + pages[n] + "\",\"aspect\":0.7071,\"name\":\"플래너 " + (n + 1) + "쪽\"}");
        return "{\"id\":\"" + id + "\",\"name\":\"플래너\",\"createdAt\":\"2026-11-10T01:00:00.000Z\",\"orientation\":\"portrait\",\"pages\":" + list + "}";
    }
    static final String STYLE = "{\"backgroundColor\":\"#fff8e7\",\"layoutColor\":\"#33476B\",\"font\":\"nanum-gothic\"}";
    org.springframework.test.web.servlet.ResultActions put(Actor actor, String body) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/me/paper-library")
            .header("Authorization", "Bearer " + actor.token()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test void emptyLibraryThenSaveAndReadBackOnAnotherDevice() throws Exception {
        var actor = actor();
        var first = image(actor.id()); var second = image(actor.id());
        mvc.perform(get("/api/v1/me/paper-library").header("Authorization", "Bearer " + actor.token()))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("version").value(0)).andExpect(jsonPath("papers.length()").value(0)).andExpect(jsonPath("style").doesNotExist());
        put(actor, body(0, "[" + paper("p1", first, second) + "]", STYLE)).andExpect(status().isOk()).andExpect(jsonPath("version").value(1));
        // 다른 기기(같은 계정, 새 로그인)에서 같은 속지 목록 · 기본 속지 스타일을 받는다
        var otherDevice = new Actor(actor.id(), login.login(new LoginRequest(users.findById(actor.id()).orElseThrow().getEmail(), "DioMember123!", "paper-test-2"), "127.0.0.1").accessToken());
        mvc.perform(get("/api/v1/me/paper-library").header("Authorization", "Bearer " + otherDevice.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("version").value(1))
            .andExpect(jsonPath("papers[0].id").value("p1"))
            .andExpect(jsonPath("papers[0].name").value("플래너"))
            .andExpect(jsonPath("papers[0].orientation").value("portrait"))
            .andExpect(jsonPath("papers[0].pages.length()").value(2))
            .andExpect(jsonPath("papers[0].pages[0].mediaFileId").value(first.toString()))
            .andExpect(jsonPath("papers[0].pages[1].aspect").value(0.7071))
            .andExpect(jsonPath("papers[0].pages[1].name").value("플래너 2쪽"))
            .andExpect(jsonPath("style.backgroundColor").value("#FFF8E7"))
            .andExpect(jsonPath("style.layoutColor").value("#33476B"))
            .andExpect(jsonPath("style.font").value("nanum-gothic"));
        assertThat(jdbc.queryForList("select media_file_id from user_paper_library_media where user_id=?", UUID.class, actor.id())).containsExactlyInAnyOrder(first, second);
        // 스타일만 기본값(글꼴 없음)으로 돌려도 저장된다
        put(actor, body(1, "[" + paper("p1", first, second) + "]", "{\"backgroundColor\":\"#FFFFFF\",\"layoutColor\":\"#292929\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("version").value(2)).andExpect(jsonPath("style.font").doesNotExist());
        // 표지 보관함과는 따로 저장된다
        mvc.perform(get("/api/v1/me/cover-library").header("Authorization", "Bearer " + actor.token())).andExpect(jsonPath("version").value(0));
    }

    @Test void staleVersionIsRejectedSoAnotherDevicesChangeIsNotOverwritten() throws Exception {
        var actor = actor();
        put(actor, body(0, "[]", STYLE)).andExpect(status().isOk());
        put(actor, body(1, "[" + paper("b", image(actor.id())) + "]", "null")).andExpect(status().isOk()).andExpect(jsonPath("version").value(2));
        put(actor, body(1, "[]", STYLE)).andExpect(status().isConflict()).andExpect(jsonPath("code").value("PAPER_LIBRARY_CONFLICT"));
        mvc.perform(get("/api/v1/me/paper-library").header("Authorization", "Bearer " + actor.token()))
            .andExpect(jsonPath("version").value(2)).andExpect(jsonPath("papers[0].id").value("b")).andExpect(jsonPath("style").doesNotExist());
    }

    @Test void onlyMyOwnImagesCanBeStored() throws Exception {
        var actor = actor(); var other = actor();
        put(actor, body(0, "[" + paper("a", image(actor.id()), image(other.id())) + "]", "null"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("PAPER_MEDIA_NOT_FOUND"));
        put(actor, body(0, "[" + paper("a", media(actor.id(), "FONT")) + "]", "null"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("PAPER_MEDIA_NOT_FOUND"));
    }

    @Test void malformedLibrariesAreRejected() throws Exception {
        var actor = actor();
        String page = "{\"mediaFileId\":\"" + UUID.randomUUID() + "\",\"aspect\":0.75}";
        String[][] cases = {
            {"[{\"id\":\"a\",\"name\":\"A\",\"orientation\":\"portrait\",\"pages\":[" + page + "]},{\"id\":\"a\",\"name\":\"B\",\"orientation\":\"portrait\",\"pages\":[" + page + "]}]", "null"}, // 같은 id
            {"[{\"id\":\"../x\",\"name\":\"A\",\"orientation\":\"portrait\",\"pages\":[" + page + "]}]", "null"}, // id 형식
            {"[{\"id\":\"a\",\"name\":\" \",\"orientation\":\"portrait\",\"pages\":[" + page + "]}]", "null"}, // 빈 이름
            {"[{\"id\":\"a\",\"name\":\"A\",\"orientation\":\"sideways\",\"pages\":[" + page + "]}]", "null"}, // 방향
            {"[{\"id\":\"a\",\"name\":\"A\",\"orientation\":\"portrait\",\"pages\":[]}]", "null"}, // 쪽 없음
            {"[{\"id\":\"a\",\"name\":\"A\",\"orientation\":\"portrait\",\"pages\":[{\"mediaFileId\":\"not-a-uuid\",\"aspect\":0.75}]}]", "null"}, // 그림 id 형식
            {"[{\"id\":\"a\",\"name\":\"A\",\"orientation\":\"portrait\",\"pages\":[{\"mediaFileId\":\"" + UUID.randomUUID() + "\",\"aspect\":0}]}]", "null"}, // 비율
            {"[]", "{\"backgroundColor\":\"white\",\"layoutColor\":\"#292929\"}"}, // 색 형식
            {"[]", "{\"backgroundColor\":\"#FFFFFF\",\"layoutColor\":\"#292929\",\"font\":\"../x\"}"}, // 글꼴 형식
            {"null", "null"}, // 목록 없음
        };
        for (String[] c : cases) put(actor, body(0, c[0], c[1])).andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("INVALID_PAPER_LIBRARY"));
        mvc.perform(get("/api/v1/me/paper-library")).andExpect(status().isUnauthorized());
    }

    @Test void libraryImagesAreReferencesAndWithdrawalErasesTheLibrary() throws Exception {
        var actor = actor();
        var page = image(actor.id());
        put(actor, body(0, "[" + paper("a", page) + "]", STYLE)).andExpect(status().isOk());
        jdbc.update("update media_files set deleted_at=? where media_file_id=?", java.sql.Timestamp.from(Instant.parse("2020-01-01T00:00:00Z")), page);
        String unreferenced = com.f106.DIO.media.repository.MediaReferenceSql.H2_UNREFERENCED;
        assertThat(jdbc.queryForObject("select count(*) from media_files where media_file_id=? " + unreferenced, Integer.class, page)).isZero();
        // 미디어에서 지운 쪽 그림도 이미 보관함에 있었으면 다시 저장할 수 있다
        put(actor, body(1, "[" + paper("a", page) + "]", STYLE)).andExpect(status().isOk());
        jdbc.update("update media_files set deleted_at=null where media_file_id=?", page);
        withdrawal.erasePrivate(actor.id(), Instant.now());
        assertThat(jdbc.queryForObject("select count(*) from user_paper_libraries where user_id=?", Integer.class, actor.id())).isZero();
        assertThat(jdbc.queryForObject("select count(*) from user_paper_library_media where user_id=?", Integer.class, actor.id())).isZero();
        assertThat(jdbc.queryForObject("select deleted_at from media_files where media_file_id=?", java.sql.Timestamp.class, page)).isNotNull();
    }
}
