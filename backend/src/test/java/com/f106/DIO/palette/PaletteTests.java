package com.f106.DIO.palette;

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
    "spring.datasource.url=jdbc:h2:mem:user-palettes;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "dio.auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "dio.signup.photos.storage=local", "dio.signup.photos.local-directory=build/test-palette-photos",
    "SHARING_INVITE_SECRET=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
    "SHARING_INVITE_BASE_URL=https://dio.test/invite/"})
@AutoConfigureMockMvc @ActiveProfiles("test")
class PaletteTests {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired EmailAuthProviderRepository accounts;
    @Autowired EmailLoginService login;
    @Autowired JdbcTemplate jdbc;
    @Autowired com.f106.DIO.user.repository.UserWithdrawalDataRepository withdrawal;
    record Actor(long id, String email, String token) {}

    // 탈퇴 정리가 보는 표 중 기본 H2 스키마(엔티티)에 없는 것만 만든다(StickerLibraryTests 와 같은 방법)
    @org.junit.jupiter.api.BeforeEach void missingTables() {
        jdbc.execute("create table if not exists notifications(user_id bigint)");
        jdbc.execute("create table if not exists diary_handwriting_fonts(font_media_file_id uuid, granted_by_user_id bigint)");
        jdbc.execute("create table if not exists ai_jobs(source_media_file_id uuid, result_media_file_id uuid)");
        jdbc.execute("alter table media_files add column if not exists source_media_file_id uuid");
        jdbc.execute("alter table diary_members add column if not exists member_profile_photo_id uuid");
        jdbc.execute("create table if not exists canvas_history_operations(page_id uuid, before_state_json varchar, after_state_json varchar)");
    }

    Actor actor() {
        var user = users.saveAndFlush(new User(UUID.randomUUID() + "@example.com", "팔레트", Instant.now()));
        accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(), user.getEmail(), new BCryptPasswordEncoder(4).encode("DioMember123!"), Instant.now()));
        return new Actor(user.getUserId(), user.getEmail(), login.login(new LoginRequest(user.getEmail(), "DioMember123!", "palette-test"), "127.0.0.1").accessToken());
    }
    Actor otherDevice(Actor actor) {
        return new Actor(actor.id(), actor.email(), login.login(new LoginRequest(actor.email(), "DioMember123!", "palette-test-2"), "127.0.0.1").accessToken());
    }
    String body(long expected, String palettes) { return "{\"expectedVersion\":" + expected + ",\"palettes\":" + palettes + "}"; }
    org.springframework.test.web.servlet.ResultActions put(Actor actor, String body) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/v1/me/palettes")
            .header("Authorization", "Bearer " + actor.token()).contentType(MediaType.APPLICATION_JSON).content(body));
    }
    org.springframework.test.web.servlet.ResultActions read(Actor actor) throws Exception {
        return mvc.perform(get("/api/v1/me/palettes").header("Authorization", "Bearer " + actor.token()));
    }

    @Test void emptyThenSaveAndReadBackOnAnotherDevice() throws Exception {
        var actor = actor();
        read(actor).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("version").value(0)).andExpect(jsonPath("palettes").isEmpty());
        put(actor, body(0, "{\"pen\":[\"#111111\",\"#ABCDEF\"],\"tape\":[\"pink\",\"custom:#F8D9DF:#C96B7B\"],\"paperLine\":[\"#292929\"]}"))
            .andExpect(status().isOk()).andExpect(jsonPath("version").value(1));
        // 다른 기기(같은 계정, 새 로그인)에서 같은 팔레트를 받는다
        read(otherDevice(actor)).andExpect(status().isOk()).andExpect(jsonPath("version").value(1))
            .andExpect(jsonPath("palettes.pen[1]").value("#ABCDEF"))
            .andExpect(jsonPath("palettes.tape[0]").value("pink"))
            .andExpect(jsonPath("palettes.tape[1]").value("custom:#F8D9DF:#C96B7B"))
            .andExpect(jsonPath("palettes.paperLine[0]").value("#292929"));
    }

    @Test void staleVersionIsRejectedSoAnotherDevicesChangeIsNotOverwritten() throws Exception {
        var actor = actor();
        put(actor, body(0, "{\"pen\":[\"#111111\"]}")).andExpect(status().isOk());
        put(actor, body(1, "{\"pen\":[\"#222222\"]}")).andExpect(status().isOk()).andExpect(jsonPath("version").value(2));
        put(actor, body(1, "{\"pen\":[\"#333333\"]}")).andExpect(status().isConflict()).andExpect(jsonPath("code").value("PALETTE_CONFLICT"));
        put(actor, body(0, "{}")).andExpect(status().isConflict());
        read(actor).andExpect(jsonPath("version").value(2)).andExpect(jsonPath("palettes.pen[0]").value("#222222"));
    }

    @Test void palettesAreOwnedPerAccount() throws Exception {
        var actor = actor(); var other = actor();
        put(actor, body(0, "{\"text\":[\"#FFFFFF\"]}")).andExpect(status().isOk());
        read(other).andExpect(jsonPath("version").value(0)).andExpect(jsonPath("palettes").isEmpty());
    }

    @Test void malformedPalettesAreRejected() throws Exception {
        var actor = actor();
        for (String palettes : new String[] {
            "{\"pen\":[]}", // 빈 칸 목록
            "{\"pen\":[\"#12345\"]}", // 색 형식
            "{\"pen\":[\"red\"]}", // 테이프가 아닌 도구에 테이프 기본 색 id
            "{\"highlighter\":[\"custom:#FFFFFF:#000000\"]}", // 테이프가 아닌 도구에 테이프 사용자 색
            "{\"pen\":[null]}",
            "{\"tape\":[\"custom:#FFFFFF\"]}", // 테이프 사용자 색 형식
            "{\"../x\":[\"#FFFFFF\"]}", // 도구 이름
            "{\"pen\":[" + "\"#FFFFFF\",".repeat(64) + "\"#FFFFFF\"]}", // 65칸
        }) put(actor, body(0, palettes)).andExpect(status().isBadRequest()).andExpect(jsonPath("code").value("INVALID_PALETTE"));
        put(actor, "{\"palettes\":{}}").andExpect(status().isBadRequest());
        put(actor, "{\"expectedVersion\":0}").andExpect(status().isBadRequest());
        read(actor).andExpect(jsonPath("version").value(0));
        mvc.perform(get("/api/v1/me/palettes")).andExpect(status().isUnauthorized());
    }

    @Test void withdrawalErasesPalettes() throws Exception {
        var actor = actor();
        put(actor, body(0, "{\"pen\":[\"#111111\"]}")).andExpect(status().isOk());
        withdrawal.erasePrivate(actor.id(), Instant.now());
        assertThat(jdbc.queryForObject("select count(*) from user_palettes where user_id=?", Integer.class, actor.id())).isZero();
    }
}
