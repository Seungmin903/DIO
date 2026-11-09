package com.f106.DIO.cover;

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
    "spring.datasource.url=jdbc:h2:mem:cover-library;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "dio.auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "dio.signup.photos.storage=local", "dio.signup.photos.local-directory=build/test-cover-photos",
    "SHARING_INVITE_SECRET=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
    "SHARING_INVITE_BASE_URL=https://dio.test/invite/"})
@AutoConfigureMockMvc @ActiveProfiles("test")
class CoverLibraryTests {
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
        var user = users.saveAndFlush(new User(UUID.randomUUID() + "@example.com", "표지", Instant.now()));
        accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(), user.getEmail(), new BCryptPasswordEncoder(4).encode("DioMember123!"), Instant.now()));
        return new Actor(user.getUserId(), login.login(new LoginRequest(user.getEmail(), "DioMember123!", "cover-test"), "127.0.0.1").accessToken());
    }
    UUID image(long owner) { return media(owner, "IMAGE"); }
    UUID media(long owner, String type) {
        var id = UUID.randomUUID();
        jdbc.update("insert into media_files(media_file_id,owner_user_id,media_type,source_type,library_category,storage_key,mime_type,file_size,status,created_at) values(?,?,?,'UPLOAD','PHOTO',?,'image/png',1,'READY',?)",
            id, owner, type, "test/" + id, java.sql.Timestamp.from(Instant.now()));
        return id;
    }
    String body(long expected, String covers) { return "{\"expectedVersion\":" + expected + ",\"covers\":" + covers + "}"; }
    // 공방에서 PDF 첫 쪽으로 만든 사진 표지(앱 coverDesign 모양 일부) + 꾸민 스티커 하나
    String photoCover(String id, UUID photo, UUID sticker) {
        return "{\"id\":\"" + id + "\",\"name\":\"여행 표지\",\"createdAt\":\"2026-11-10T01:00:00.000Z\",\"orientation\":\"portrait\",\"cover\":{"
            + "\"enabled\":true,\"kind\":\"photo\",\"color\":\"#C9B8A6\",\"gradient\":null,"
            + "\"photo\":{\"src\":\"media:" + photo + "\",\"mediaFileId\":\"" + photo + "\",\"aspect\":0.75,\"crop\":{\"x\":0.1,\"y\":0,\"zoom\":1.5}},"
            + "\"title\":{\"useName\":true,\"text\":\"\",\"at\":null},"
            + "\"stickers\":[{\"id\":\"s1\",\"src\":\"media:" + sticker + "\",\"mediaFileId\":\"" + sticker + "\",\"x\":40,\"y\":60,\"size\":14,\"rotation\":0},{\"id\":\"s2\",\"builtin\":\"heart\",\"x\":50,\"y\":50,\"size\":14,\"rotation\":12.5}]}}";
    }
    org.springframework.test.web.servlet.ResultActions put(Actor actor, String body) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/me/cover-library")
            .header("Authorization", "Bearer " + actor.token()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test void emptyLibraryThenSaveAndReadBackOnAnotherDevice() throws Exception {
        var actor = actor();
        var photo = image(actor.id()); var sticker = image(actor.id());
        mvc.perform(get("/api/v1/me/cover-library").header("Authorization", "Bearer " + actor.token()))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("version").value(0)).andExpect(jsonPath("covers.length()").value(0));
        put(actor, body(0, "[" + photoCover("c1", photo, sticker) + ",{\"id\":\"c2\",\"name\":\"색 표지\",\"orientation\":\"landscape\",\"cover\":{\"kind\":\"plain\",\"color\":\"#112233\"}}]"))
            .andExpect(status().isOk()).andExpect(jsonPath("version").value(1));
        // 다른 기기(같은 계정, 새 로그인)에서 표지 디자인까지 같은 목록으로 받는다
        var otherDevice = new Actor(actor.id(), login.login(new LoginRequest(users.findById(actor.id()).orElseThrow().getEmail(), "DioMember123!", "cover-test-2"), "127.0.0.1").accessToken());
        mvc.perform(get("/api/v1/me/cover-library").header("Authorization", "Bearer " + otherDevice.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("version").value(1))
            .andExpect(jsonPath("covers[0].id").value("c1"))
            .andExpect(jsonPath("covers[0].name").value("여행 표지"))
            .andExpect(jsonPath("covers[0].createdAt").value("2026-11-10T01:00:00.000Z"))
            .andExpect(jsonPath("covers[0].orientation").value("portrait"))
            .andExpect(jsonPath("covers[0].cover.photo.mediaFileId").value(photo.toString()))
            .andExpect(jsonPath("covers[0].cover.photo.crop.zoom").value(1.5))
            .andExpect(jsonPath("covers[0].cover.stickers[0].mediaFileId").value(sticker.toString()))
            .andExpect(jsonPath("covers[0].cover.stickers[1].rotation").value(12.5))
            .andExpect(jsonPath("covers[1].cover.color").value("#112233"));
        assertThat(jdbc.queryForList("select media_file_id from user_cover_library_media where user_id=?", UUID.class, actor.id())).containsExactlyInAnyOrder(photo, sticker);
        // 테이프 보관함과는 따로 저장된다
        mvc.perform(get("/api/v1/me/tape-library").header("Authorization", "Bearer " + actor.token())).andExpect(jsonPath("version").value(0));
    }

    @Test void staleVersionIsRejectedSoAnotherDevicesChangeIsNotOverwritten() throws Exception {
        var actor = actor();
        String plain = "{\"id\":\"%s\",\"name\":\"%s\",\"orientation\":\"portrait\",\"cover\":{\"kind\":\"plain\"}}";
        put(actor, body(0, "[" + plain.formatted("a", "A") + "]")).andExpect(status().isOk());
        put(actor, body(1, "[" + plain.formatted("b", "B") + "]")).andExpect(status().isOk()).andExpect(jsonPath("version").value(2));
        put(actor, body(1, "[]")).andExpect(status().isConflict()).andExpect(jsonPath("code").value("COVER_LIBRARY_CONFLICT"));
        mvc.perform(get("/api/v1/me/cover-library").header("Authorization", "Bearer " + actor.token()))
            .andExpect(jsonPath("version").value(2)).andExpect(jsonPath("covers[0].id").value("b"));
    }

    @Test void onlyMyOwnImagesCanBeStored() throws Exception {
        var actor = actor(); var other = actor();
        put(actor, body(0, "[" + photoCover("a", image(other.id()), image(actor.id())) + "]"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("COVER_MEDIA_NOT_FOUND"));
        put(actor, body(0, "[" + photoCover("a", image(actor.id()), media(actor.id(), "FONT")) + "]"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("COVER_MEDIA_NOT_FOUND"));
    }

    @Test void malformedLibrariesAreRejected() throws Exception {
        var actor = actor();
        String big = "x".repeat(CoverLibraryService.MAX_COVER_BYTES);
        for (String covers : new String[] {
            "[{\"id\":\"a\",\"name\":\"A\",\"orientation\":\"portrait\",\"cover\":{}},{\"id\":\"a\",\"name\":\"B\",\"orientation\":\"portrait\",\"cover\":{}}]", // 같은 id
            "[{\"id\":\"../x\",\"name\":\"A\",\"orientation\":\"portrait\",\"cover\":{}}]", // id 형식
            "[{\"id\":\"a\",\"name\":\" \",\"orientation\":\"portrait\",\"cover\":{}}]", // 빈 이름
            "[{\"id\":\"a\",\"name\":\"A\",\"orientation\":\"sideways\",\"cover\":{}}]", // 방향
            "[{\"id\":\"a\",\"name\":\"A\",\"orientation\":\"portrait\"}]", // 디자인 없음
            "[{\"id\":\"a\",\"name\":\"A\",\"orientation\":\"portrait\",\"cover\":[1]}]", // 디자인이 객체가 아님
            "[{\"id\":\"a\",\"name\":\"A\",\"orientation\":\"portrait\",\"cover\":{\"photo\":{\"mediaFileId\":\"not-a-uuid\"}}}]", // 그림 id 형식
            "[{\"id\":\"a\",\"name\":\"A\",\"orientation\":\"portrait\",\"cover\":{\"note\":\"" + big + "\"}}]", // 너무 큼
        }) put(actor, body(0, covers)).andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("INVALID_COVER_LIBRARY"));
        mvc.perform(get("/api/v1/me/cover-library")).andExpect(status().isUnauthorized());
    }

    @Test void libraryImagesAreReferencesAndWithdrawalErasesTheLibrary() throws Exception {
        var actor = actor();
        var photo = image(actor.id()); var sticker = image(actor.id());
        put(actor, body(0, "[" + photoCover("a", photo, sticker) + "]")).andExpect(status().isOk());
        jdbc.update("update media_files set deleted_at=? where media_file_id=?", java.sql.Timestamp.from(Instant.parse("2020-01-01T00:00:00Z")), photo);
        String unreferenced = com.f106.DIO.media.repository.MediaReferenceSql.H2_UNREFERENCED;
        assertThat(jdbc.queryForObject("select count(*) from media_files where media_file_id=? " + unreferenced, Integer.class, photo)).isZero();
        // 미디어에서 지운 표지 사진도 이미 보관함에 있었으면 다시 저장할 수 있다
        put(actor, body(1, "[" + photoCover("a", photo, sticker) + "]")).andExpect(status().isOk());
        jdbc.update("update media_files set deleted_at=null where media_file_id=?", photo);
        withdrawal.erasePrivate(actor.id(), Instant.now());
        assertThat(jdbc.queryForObject("select count(*) from user_cover_libraries where user_id=?", Integer.class, actor.id())).isZero();
        assertThat(jdbc.queryForObject("select count(*) from user_cover_library_media where user_id=?", Integer.class, actor.id())).isZero();
        assertThat(jdbc.queryForObject("select deleted_at from media_files where media_file_id=?", java.sql.Timestamp.class, photo)).isNotNull();
    }
}
