package com.f106.DIO.font;

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
import org.springframework.test.web.servlet.ResultActions;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// 새 테스트 컨텍스트를 만들지 않도록 CoverLibraryTests 와 설정을 똑같이 맞춰 그 컨텍스트를 함께 쓴다.
// (CI는 한 JVM에서 돌고 컨텍스트 캐시가 16개라, 컨텍스트가 하나 늘면 기본 testdb 를 쓰는 컨텍스트가 밀려나며 create-drop 으로 표를 지운다)
@org.springframework.test.context.jdbc.Sql("/push-session-h2.sql")
@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:cover-library;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "dio.auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "dio.signup.photos.storage=local", "dio.signup.photos.local-directory=build/test-cover-photos",
    "SHARING_INVITE_SECRET=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
    "SHARING_INVITE_BASE_URL=https://dio.test/invite/"})
@AutoConfigureMockMvc @ActiveProfiles("test")
class FontShareConsentTests {
    static final String PATH = "/api/v1/handwriting-fonts/share-consent";
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired EmailAuthProviderRepository accounts;
    @Autowired EmailLoginService login;
    @Autowired JdbcTemplate jdbc;
    record Actor(long id, String token) {}

    Actor actor() {
        var user = users.saveAndFlush(new User(UUID.randomUUID() + "@example.com", "폰트동의", Instant.now()));
        accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(), user.getEmail(), new BCryptPasswordEncoder(4).encode("DioMember123!"), Instant.now()));
        return new Actor(user.getUserId(), login.login(new LoginRequest(user.getEmail(), "DioMember123!", "font-consent-test"), "127.0.0.1").accessToken());
    }
    ResultActions read(Actor actor) throws Exception {
        return mvc.perform(get(PATH).header("Authorization", "Bearer " + actor.token()));
    }
    ResultActions write(Actor actor, String body) throws Exception {
        return mvc.perform(put(PATH).header("Authorization", "Bearer " + actor.token()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test void 로그인이_필요하다() throws Exception {
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
        mvc.perform(put(PATH).contentType(MediaType.APPLICATION_JSON).content("{\"agreed\":true}")).andExpect(status().isUnauthorized());
    }

    @Test void 처음에는_묻지_않음이고_조회는_기록을_만들지_않는다() throws Exception {
        var actor = actor();
        read(actor).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("status").value("NOT_ASKED")).andExpect(jsonPath("changedAt").value(org.hamcrest.Matchers.nullValue()));
        assertThat(jdbc.queryForObject("select count(*) from user_terms_agreements where user_id=?", Integer.class, actor.id())).isZero();
    }

    @Test void 저장한_값을_같은_계정의_다른_세션에서도_읽고_다른_계정과는_섞이지_않는다() throws Exception {
        var actor = actor();
        var other = actor();
        write(actor, "{\"agreed\":true}").andExpect(status().isOk()).andExpect(jsonPath("status").value("GRANTED"))
            .andExpect(jsonPath("changedAt").isString());
        // 같은 계정으로 다른 기기에 로그인한 세션
        var device = new Actor(actor.id(), login.login(new LoginRequest(users.findById(actor.id()).orElseThrow().getEmail(), "DioMember123!", "second-device"), "127.0.0.2").accessToken());
        read(device).andExpect(jsonPath("status").value("GRANTED"));
        read(other).andExpect(jsonPath("status").value("NOT_ASKED"));
        write(device, "{\"agreed\":false}").andExpect(jsonPath("status").value("DENIED"));
        read(actor).andExpect(jsonPath("status").value("DENIED"));
    }

    @Test void 같은_값을_다시_보내면_바꾼_시각을_유지한다() throws Exception {
        var actor = actor();
        var first = write(actor, "{\"agreed\":false}").andReturn().getResponse().getContentAsString();
        var again = write(actor, "{\"agreed\":false}").andReturn().getResponse().getContentAsString();
        assertThat(again).isEqualTo(first);
    }

    @Test void 같은_계정의_두_세션은_폰트_생성_한도를_공유한다() throws Exception {
        var actor = actor();
        var other = actor();
        var device = new Actor(actor.id(), login.login(new LoginRequest(users.findById(actor.id()).orElseThrow().getEmail(),
            "DioMember123!", "second-device"), "127.0.0.2").accessToken());
        var first = UUID.randomUUID();
        var second = UUID.randomUUID();
        var path = "/api/v1/handwriting-fonts/generation-slot";
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        updateSlot(actor, first, "RESERVE").andExpect(status().isNoContent());
        updateSlot(device, first, "RESERVE").andExpect(status().isNoContent());
        updateSlot(device, second, "RESERVE").andExpect(status().isConflict()).andExpect(jsonPath("code").value("FONT_GENERATION_LIMIT"));
        updateSlot(other, second, "RESERVE").andExpect(status().isNoContent());
        updateSlot(actor, first, "RELEASE").andExpect(status().isNoContent());
        updateSlot(device, second, "RESERVE").andExpect(status().isNoContent());
        updateSlot(device, second, "COMPLETE").andExpect(status().isNoContent());
        updateSlot(actor, second, "RELEASE").andExpect(status().isNoContent());
        mvc.perform(get(path).header("Authorization", "Bearer " + actor.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("generationId").value(second.toString())).andExpect(jsonPath("completed").value(true));
        updateSlot(actor, first, "RESERVE").andExpect(status().isConflict());
    }

    private ResultActions updateSlot(Actor actor, UUID generationId, String action) throws Exception {
        return mvc.perform(put("/api/v1/handwriting-fonts/generation-slot").header("Authorization", "Bearer " + actor.token())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"generationId\":\"%s\",\"action\":\"%s\"}".formatted(generationId, action)));
    }

    @Test void 옮기기_저장은_아직_답이_없을_때만_쓰고_있으면_있는_값을_돌려준다() throws Exception {
        var actor = actor();
        write(actor, "{\"agreed\":false,\"onlyIfNotAsked\":true}").andExpect(jsonPath("status").value("DENIED"));
        write(actor, "{\"agreed\":true,\"onlyIfNotAsked\":true}").andExpect(status().isOk()).andExpect(jsonPath("status").value("DENIED"));
        read(actor).andExpect(jsonPath("status").value("DENIED"));
        write(actor, "{\"agreed\":true,\"onlyIfNotAsked\":false}").andExpect(jsonPath("status").value("GRANTED"));
    }

    @Test void agreed_가_없으면_400() throws Exception {
        write(actor(), "{}").andExpect(status().isBadRequest());
    }

    @Test void 기존_선택_약관_조회는_폰트_동의를_섞지_않는다() throws Exception {
        var actor = actor();
        write(actor, "{\"agreed\":true}").andExpect(status().isOk());
        mvc.perform(get("/api/v1/me/terms").header("Authorization", "Bearer " + actor.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("agreements.length()").value(4))
            .andExpect(jsonPath("agreements[*].termsType", org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("FONT_SHARE"))));
        // 일반 약관 변경 API 로는 이 항목을 바꿀 수 없다(TermsType 에 없음)
        mvc.perform(put("/api/v1/me/terms/FONT_SHARE/v1").header("Authorization", "Bearer " + actor.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"agreed\":false}")).andExpect(status().isBadRequest());
        read(actor).andExpect(jsonPath("status").value("GRANTED"));
    }
}
