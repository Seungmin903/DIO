package com.f106.DIO.sharing;
import com.f106.DIO.diary.domain.DiaryMember;
import com.f106.DIO.diary.domain.DiaryMemberId;
import com.f106.DIO.diary.repository.DiaryMemberRepository;
import com.f106.DIO.auth.domain.EmailAuthProvider;
import com.f106.DIO.auth.dto.LoginRequest;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.auth.service.EmailLoginService;
import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.sharing.dto.*;
import com.f106.DIO.sharing.exception.SharingException;
import com.f106.DIO.sharing.repository.*;
import com.f106.DIO.sharing.service.*;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
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
@org.springframework.test.context.jdbc.Sql(scripts={"classpath:invitation-notification-h2.sql", "classpath:push-session-h2.sql"})
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:sharing-tests;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "dio.auth.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "dio.signup.photos.storage=local", "dio.signup.photos.local-directory=build/test-member-photos/${org.gradle.test.worker:0}",
    "SHARING_INVITE_BASE_URL=https://dio.test/invite/",
    "SHARING_INVITE_SECRET=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=", "spring.datasource.hikari.maximum-pool-size=12",
    // 공유 · 신고 · 탈퇴 테스트가 따로 두던 값을 모아 모두 같은 스프링 컨텍스트를 쓴다(테스트 데이터는 매번 고유 사용자로 만든다)
    "dio.media.local-directory=build/test-report-media/${org.gradle.test.worker:0}", "dio.signup.mail-from=notifications@dio.test", "dio.moderation.report-mail.to=ops@dio.test"})
@AutoConfigureMockMvc @ActiveProfiles("test")
abstract class SharingTestSupport {
    @Autowired MockMvc mvc;
    // 프로필 사진이 실제로 저장되는 폴더(병렬 JVM 마다 다르다). 파일이 남았는지 볼 때 이 값을 쓴다
    @org.springframework.beans.factory.annotation.Value("${dio.signup.photos.local-directory}") String photoDirectory;
    // 실제 빈을 감싼 스파이(평소에는 그대로 위임). 하위 테스트마다 따로 두면 스프링 컨텍스트가 테스트 클래스마다 새로 뜨므로 여기 모아 둔다
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean com.f106.DIO.sharing.infrastructure.storage.SharingPhotoStorage photoStorage; // DiaryProfileTests
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean com.f106.DIO.notification.event.InvitationNotificationRepository notificationRepository; // EmailInviteTests
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean com.f106.DIO.media.storage.MediaStorage evidenceStorage; // ModerationTests
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean com.f106.DIO.user.infrastructure.storage.ProfilePhotoFiles photoFiles; // UserWithdrawalTests
    @Autowired UserRepository users;
    @Autowired EmailAuthProviderRepository accounts;
    @Autowired EmailLoginService login;
    @Autowired DiaryRepository diaries;
    @Autowired DiaryMemberRepository members;
    @Autowired DiaryInviteRepository invites;
    @Autowired DiaryInviteService links;
    @Autowired DiaryMembershipService membership;
    @Autowired com.f106.DIO.sharing.service.DiaryProfileService profiles;
    @Autowired com.f106.DIO.sharing.service.DiaryOwnershipService ownership;
    @Autowired JdbcTemplate jdbc;
    @Autowired com.f106.DIO.sharing.support.InviteTokens tokenSigner;
    static final String PASSWORD="DioMember123!";
    static final BCryptPasswordEncoder FIXTURE_ENCODER=new BCryptPasswordEncoder(4);
    record Actor(long id,String token){}
    Actor actor(){
        String unique=UUID.randomUUID().toString();
        var user=users.saveAndFlush(new User(unique+"@example.com","멤버"+unique.substring(0,12),Instant.now()));
        accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(),user.getEmail(),FIXTURE_ENCODER.encode(PASSWORD),Instant.now()));
        return new Actor(user.getUserId(),login.login(new LoginRequest(user.getEmail(),PASSWORD,"sharing-test"),"127.0.0.1").accessToken());
    }
    UUID diary(Actor owner){var diary=new Diary("공유 테스트","#CED9EE","PLAIN","PRIVATE",owner.id());diary.transferOwnership(owner.id());return diaries.saveAndFlush(diary).getDiaryId();}

    @org.springframework.test.context.bean.override.mockito.MockitoBean
    org.springframework.mail.javamail.JavaMailSender smtp;
}
