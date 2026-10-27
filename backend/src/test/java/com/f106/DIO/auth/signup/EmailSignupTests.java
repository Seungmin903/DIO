package com.f106.DIO.auth.signup;

import java.time.Instant;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;
import java.util.concurrent.atomic.AtomicReference;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "dio.signup.verification-secret=testing-only-secret-at-least-32-bytes-long")
@AutoConfigureMockMvc @ActiveProfiles("test")
class EmailSignupTests {
    private static final java.nio.file.Path PHOTO_DIRECTORY = temporaryPhotoDirectory();
    private static java.nio.file.Path temporaryPhotoDirectory() {
        try { return java.nio.file.Files.createTempDirectory("dio-signup-photo-test-"); }
        catch (java.io.IOException error) { throw new java.io.UncheckedIOException(error); }
    }
    @DynamicPropertySource static void photoStorage(DynamicPropertyRegistry registry) {
        registry.add("dio.signup.photos.local-directory", () -> PHOTO_DIRECTORY.toString());
    }
    @org.junit.jupiter.api.AfterAll static void removeTestPhotos() throws Exception {
        try (var files = java.nio.file.Files.walk(PHOTO_DIRECTORY)) {
            for (var path : files.sorted(java.util.Comparator.reverseOrder()).toList()) java.nio.file.Files.deleteIfExists(path);
        }
    }
    private static final String EMAIL = "member@example.com";
    @Autowired MockMvc mvc;
    @Autowired EmailVerificationService verification;
    @Autowired EmailSignupService signup;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;
    @Autowired SignupUserRepository users;
    @MockitoSpyBean EmailAuthProviderRepository providers;
    @Autowired TermsAgreementRepository agreements;
    @Autowired EmailVerificationRepository verifications;
    @MockitoSpyBean SignupProfilePhotoRepository photos;
    @MockitoSpyBean ProfilePhotoFiles photoFiles;
    @Autowired ProfilePhotoMigrationService photoMigration;
    @MockitoBean SignupMailSender mail;
    AtomicReference<String> deliveredCode;

    @BeforeEach void setup() {
        photos.deleteAll(); agreements.deleteAll(); providers.deleteAll(); users.deleteAll(); verifications.deleteAll();
        reset(mail); reset(providers); reset(photos); deliveredCode = new AtomicReference<>();
        doAnswer(invocation -> { deliveredCode.set(invocation.getArgument(1)); return null; })
            .when(mail).send(anyString(), anyString());
    }
    String verifyEmail(String email) {
        verification.send(email);
        return verification.verify(new SignupDtos.VerifyRequest(email, deliveredCode.get())).signupToken();
    }
    SignupDtos.SignupRequest request(String email, String token, String nickname) {
        return new SignupDtos.SignupRequest(email, token, "DioMember123!", nickname,
            List.of(new SignupDtos.Agreement(SignupDtos.TermsType.SERVICE, "v1", true),
                    new SignupDtos.Agreement(SignupDtos.TermsType.PRIVACY, "v1", true),
                    new SignupDtos.Agreement(SignupDtos.TermsType.MARKETING, "v1", false)));
    }
    String signupJson(String email, String token) {
        return """
            {"email":"%s","signupToken":"%s","password":"DioMember123!","nickname":"디오사용자",
            "agreements":[{"termsType":"SERVICE","termsVersion":"v1","agreed":true},
            {"termsType":"PRIVACY","termsVersion":"v1","agreed":true}]}
            """.formatted(email, token);
    }
    @Test void completeSignupPersistsHashedCredentialsTermsAndConsumesToken() throws Exception {
        String token = verifyEmail(EMAIL);
        mvc.perform(post("/api/v1/auth/signup").contentType(MediaType.APPLICATION_JSON).content(signupJson(" MEMBER@example.com ", token)))
            .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.userId").isString()).andExpect(jsonPath("$.email").value(EMAIL))
            .andExpect(jsonPath("$.profileColor").doesNotExist())
            .andExpect(jsonPath("$.profilePhotoUrl").isEmpty())
            .andExpect(jsonPath("$.birthDate").doesNotExist())
            .andExpect(jsonPath("$.password").doesNotExist()).andExpect(jsonPath("$.accessToken").doesNotExist());
        assertThat(users.count()).isEqualTo(1); assertThat(agreements.count()).isEqualTo(2);
        EmailAuthProvider account = providers.findAll().get(0);
        assertThat(account.provider).isEqualTo("EMAIL"); assertThat(account.providerUserId).isEqualTo(EMAIL);
        assertThat(new BCryptPasswordEncoder().matches("DioMember123!", account.passwordHash)).isTrue();
        assertThat(verifications.findById(EMAIL).orElseThrow().consumedAt).isNotNull();
    }
    @Test void imageDecodingHashingAndUploadRunOutsideDatabaseTransaction() throws Exception {
        String token = verifyEmail(EMAIL);
        Object original = org.springframework.test.util.ReflectionTestUtils.getField(signup, "passwords");
        var encoder = spy((BCryptPasswordEncoder)original);
        doAnswer(invocation -> {
            assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return invocation.callRealMethod();
        }).when(encoder).encode(any());
        doAnswer(invocation -> {
            assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return invocation.callRealMethod();
        }).when(photoFiles).upload(any(), any());
        byte[] jpeg = photoPart("jpeg").getBytes();
        var part = new MockMultipartFile("photo", "phone.jpg", "image/jpeg", jpeg) {
            @Override public java.io.InputStream getInputStream() {
                assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
                return new ByteArrayInputStream(jpeg);
            }
        };
        org.springframework.test.util.ReflectionTestUtils.setField(signup, "passwords", encoder);
        try {
            assertThat(signup.signup(request(EMAIL, token, "디오사용자"), part).profilePhotoUrl()).isNotBlank();
            assertThat(verifications.findById(EMAIL).orElseThrow().consumedAt).isNotNull();
        } finally { org.springframework.test.util.ReflectionTestUtils.setField(signup, "passwords", original); }
    }
    @Test void signupRechecksTokenAfterHashingAndDoesNotConsumeItOnFailure() {
        String token = verifyEmail(EMAIL);
        Object original = org.springframework.test.util.ReflectionTestUtils.getField(signup, "passwords");
        var encoder = spy((BCryptPasswordEncoder)original);
        doAnswer(invocation -> {
            Object hash = invocation.callRealMethod();
            var verification = verifications.findById(EMAIL).orElseThrow();
            verification.tokenExpiresAt = Instant.now().minusSeconds(1); verifications.saveAndFlush(verification);
            return hash;
        }).when(encoder).encode(any());
        org.springframework.test.util.ReflectionTestUtils.setField(signup, "passwords", encoder);
        try {
            assertThatThrownBy(() -> signup.signup(request(EMAIL, token, "디오사용자")))
                .isInstanceOfSatisfying(SignupException.class, error -> assertThat(error.code).isEqualTo("INVALID_SIGNUP_TOKEN"));
            assertThat(users.count()).isZero();
            assertThat(verifications.findById(EMAIL).orElseThrow().consumedAt).isNull();
        } finally { org.springframework.test.util.ReflectionTestUtils.setField(signup, "passwords", original); }
    }
    @Test void availabilityNormalizesEmailAndChangesAfterSignup() throws Exception {
        mvc.perform(post("/api/v1/auth/email-availability").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\" MEMBER@example.com \"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.available").value(true));
        signup.signup(request(EMAIL, verifyEmail(EMAIL), "디오사용자"));
        assertThat(signup.available(EMAIL).available()).isFalse();
    }
    @Test void verificationEndpointsNeverReturnCodeAndIssueNoStoreToken() throws Exception {
        mvc.perform(post("/api/v1/auth/email-verifications").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"member@example.com\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.expiresIn").value(600)).andExpect(jsonPath("$.code").doesNotExist());
        mvc.perform(post("/api/v1/auth/email-verifications/verify").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"member@example.com\",\"code\":\"" + deliveredCode.get() + "\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.signupToken").isString())
            .andExpect(header().string("Cache-Control", "no-store"));
        EmailVerification row = verifications.findById(EMAIL).orElseThrow();
        assertThat(row.codeHash).hasSize(64).isNotEqualTo(deliveredCode.get());
        assertThat(row.tokenHash).hasSize(64);
    }
    @Test void sendingAgainTooSoonIsLimited() {
        verification.send(EMAIL);
        assertThatThrownBy(() -> verification.send(EMAIL)).isInstanceOfSatisfying(SignupException.class,
            error -> assertThat(error.code).isEqualTo("VERIFICATION_RATE_LIMITED"));
        verify(mail, times(1)).send(anyString(), anyString());
    }
    @Test void wrongCodeAttemptsPersistAcrossFailedTransactions() {
        verification.send(EMAIL);
        String wrong = deliveredCode.get().equals("000000") ? "111111" : "000000";
        for (int i = 0; i < 5; i++) assertThatThrownBy(() -> verification.verify(new SignupDtos.VerifyRequest(EMAIL, wrong)))
            .isInstanceOf(SignupException.class);
        assertThat(verifications.findById(EMAIL).orElseThrow().failedAttempts).isEqualTo(5);
        assertThatThrownBy(() -> verification.verify(new SignupDtos.VerifyRequest(EMAIL, deliveredCode.get())))
            .isInstanceOfSatisfying(SignupException.class, error -> assertThat(error.code).isEqualTo("VERIFICATION_ATTEMPTS_EXCEEDED"));
    }
    @Test void expiredCodeIsRejected() {
        verification.send(EMAIL);
        EmailVerification row = verifications.findById(EMAIL).orElseThrow(); row.expiresAt = Instant.now().minusSeconds(1); verifications.saveAndFlush(row);
        assertThatThrownBy(() -> verification.verify(new SignupDtos.VerifyRequest(EMAIL, deliveredCode.get()))).isInstanceOf(SignupException.class);
    }
    @Test void verifiedCodeCannotIssueAnotherToken() {
        verifyEmail(EMAIL);
        assertThatThrownBy(() -> verification.verify(new SignupDtos.VerifyRequest(EMAIL, deliveredCode.get()))).isInstanceOf(SignupException.class);
    }
    @Test void resendInvalidatesPreviouslyVerifiedToken() {
        String oldToken = verifyEmail(EMAIL);
        EmailVerification row = verifications.findById(EMAIL).orElseThrow(); row.sentAt = Instant.now().minusSeconds(61); verifications.saveAndFlush(row);
        verification.send(EMAIL);
        assertThatThrownBy(() -> signup.signup(request(EMAIL, oldToken, "디오사용자"))).isInstanceOf(SignupException.class);
        assertThat(users.count()).isZero();
    }
    @Test void deliveryFailureRollsBackVerification() {
        doThrow(new SignupException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, "EMAIL_DELIVERY_UNAVAILABLE", "실패"))
            .when(mail).send(anyString(), anyString());
        assertThatThrownBy(() -> verification.send(EMAIL)).isInstanceOf(SignupException.class);
        assertThat(verifications.existsById(EMAIL)).isFalse();
    }
    @Test void tokenCannotBeUsedForDifferentEmail() {
        String token = verifyEmail(EMAIL); verifyEmail("other@example.com");
        assertThatThrownBy(() -> signup.signup(request("other@example.com", token, "디오사용자"))).isInstanceOf(SignupException.class);
        assertThat(users.count()).isZero();
    }
    @Test void expiredTokenIsRejectedWithoutCreatingAccount() {
        String token = verifyEmail(EMAIL);
        EmailVerification row = verifications.findById(EMAIL).orElseThrow(); row.tokenExpiresAt = Instant.now().minusSeconds(1); verifications.saveAndFlush(row);
        assertThatThrownBy(() -> signup.signup(request(EMAIL, token, "디오사용자"))).isInstanceOf(SignupException.class);
        assertThat(users.count()).isZero(); assertThat(providers.count()).isZero();
    }
    @Test void duplicateEmailCannotCreateSecondAccount() {
        String token = verifyEmail(EMAIL); signup.signup(request(EMAIL, token, "디오사용자"));
        assertThatThrownBy(() -> signup.signup(request(EMAIL, token, "다른닉네임"))).isInstanceOfSatisfying(SignupException.class,
            error -> assertThat(error.code).isEqualTo("EMAIL_ALREADY_REGISTERED"));
        assertThat(users.count()).isEqualTo(1);
    }
    @Test void duplicateNicknameDoesNotConsumeOtherEmailToken() {
        signup.signup(request(EMAIL, verifyEmail(EMAIL), "DioUser"));
        String other = "other@example.com", token = verifyEmail(other);
        assertThatThrownBy(() -> signup.signup(request(other, token, "diouser"))).isInstanceOf(SignupException.class);
        assertThat(verifications.findById(other).orElseThrow().consumedAt).isNull();
        signup.signup(request(other, token, "다른닉네임"));
        assertThat(users.count()).isEqualTo(2);
    }
    @Test void optionalMarketingDeclineIsRecorded() {
        signup.signup(request(EMAIL, verifyEmail(EMAIL), "디오사용자"));
        assertThat(agreements.findAll()).hasSize(3).anySatisfy(a -> {
            assertThat(a.termsType).isEqualTo("MARKETING"); assertThat(a.agreed).isFalse();
        });
    }
    @Test void requiredTermsAndVersionAreCheckedBeforeTokenConsumption() throws Exception {
        String token = verifyEmail(EMAIL);
        for (String body : List.of(signupJson(EMAIL, token).replace("\"agreed\":true", "\"agreed\":false"),
                                  signupJson(EMAIL, token).replace("\"v1\"", "\"v0\""),
                                  signupJson(EMAIL, token).replace("\"PRIVACY\"", "\"SERVICE\""))) {
            mvc.perform(post("/api/v1/auth/signup").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
        assertThat(verifications.findById(EMAIL).orElseThrow().consumedAt).isNull(); assertThat(users.count()).isZero();
    }
    @Test void invalidPasswordNicknameAndNullAgreementAreRejected() throws Exception {
        String token = verifyEmail(EMAIL);
        for (String body : List.of(signupJson(EMAIL, token).replace("DioMember123!", "abcdefgh"),
                signupJson(EMAIL, token).replace("DioMember123!", "한글12345678"),
                signupJson(EMAIL, token).replace("디오사용자", "a"),
                signupJson(EMAIL, token).replace("\"agreements\":[", "\"agreements\":[null,"))) {
            mvc.perform(post("/api/v1/auth/signup").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
        assertThat(users.count()).isZero();
    }
    @Test void databaseUniquenessStopsDuplicateEmailAndNickname() {
        signup.signup(request(EMAIL, verifyEmail(EMAIL), "디오사용자"));
        assertThatThrownBy(() -> users.saveAndFlush(new SignupUser(request(EMAIL, SignupSecrets.token(), "다른사용자"), Instant.now())))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> users.saveAndFlush(new SignupUser(request("other@example.com", SignupSecrets.token(), "디오사용자"), Instant.now())))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
    @Test void credentialPersistenceFailureRollsBackUserAndTokenConsumption() {
        String token = verifyEmail(EMAIL);
        doThrow(new org.springframework.dao.DataIntegrityViolationException("simulated persistence failure"))
            .when(providers).saveAndFlush(any(EmailAuthProvider.class));
        assertThatThrownBy(() -> signup.signup(request(EMAIL, token, "디오사용자")))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(users.count()).isZero(); assertThat(agreements.count()).isZero();
        assertThat(verifications.findById(EMAIL).orElseThrow().consumedAt).isNull();
    }
    @Test void consumedTokenIsRejectedEvenIfTheAccountWasRemoved() {
        String token = verifyEmail(EMAIL);
        signup.signup(request(EMAIL, token, "디오사용자"));
        agreements.deleteAll(); providers.deleteAll(); users.deleteAll();
        assertThatThrownBy(() -> signup.signup(request(EMAIL, token, "디오사용자")))
            .isInstanceOfSatisfying(SignupException.class, e -> assertThat(e.code).isEqualTo("INVALID_SIGNUP_TOKEN"));
    }
    @Test void invalidEmailsAndMalformedCodesAreRejectedBeforeSending() throws Exception {
        mvc.perform(post("/api/v1/auth/email-verifications").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"not-an-email\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/auth/email-verifications/verify").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"member@example.com\",\"code\":\"123\"}")).andExpect(status().isBadRequest());
        verifyNoInteractions(mail);
    }
    @Test void nicknameAvailabilityUsesNormalizedCaseInsensitiveRegistrationPolicy() throws Exception {
        String body = "{\"nickname\":\"  Ｄｉｏ＿Ｍｅｍｂｅｒ  \"}";
        mvc.perform(post("/api/v1/auth/nickname-availability").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.available").value(true));
        signup.signup(request(EMAIL, verifyEmail(EMAIL), "Dio_Member"));
        mvc.perform(post("/api/v1/auth/nickname-availability").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andExpect(jsonPath("$.available").value(false));
    }
    @Test void nicknameAvailabilityRejectsReservedNamesWithoutCreatingRecords() throws Exception {
        for (String nickname : List.of("관리자", "DIO", " ｄｉｏ ")) {
            mvc.perform(post("/api/v1/auth/nickname-availability").contentType(MediaType.APPLICATION_JSON)
                .content("{\"nickname\":\"" + nickname + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.available").value(false));
        }
        assertThat(users.count()).isZero();
        assertThat(verifications.count()).isZero();
        verifyNoInteractions(mail);
    }
    @Test void nicknameAvailabilityValidatesInput() throws Exception {
        for (String body : List.of("{}", "{\"nickname\":null}", "{\"nickname\":\" \"}",
                "{\"nickname\":\"a\"}", "{\"nickname\":\"1234567890123\"}", "{\"nickname\":\"닉 네임\"}")) {
            mvc.perform(post("/api/v1/auth/nickname-availability").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
        }
    }
    MockMultipartFile signupPart(String token) {
        return new MockMultipartFile("signup", "signup.json", "application/json", signupJson(EMAIL, token).getBytes(StandardCharsets.UTF_8));
    }
    MockMultipartFile photoPart(String format) throws Exception {
        var image = new BufferedImage(800, 400, BufferedImage.TYPE_INT_RGB);
        image.setRGB(0, 0, 0xFF336699);
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(image, format, bytes);
        return new MockMultipartFile("photo", "../original." + format, "application/octet-stream", bytes.toByteArray());
    }
    @Test void multipartSignupStoresResizedPhotoAndReturnsReadablePng() throws Exception {
        mvc.perform(multipart("/api/v1/auth/signup").file(signupPart(verifyEmail(EMAIL))).file(photoPart("png")))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.profileColor").doesNotExist())
            .andExpect(jsonPath("$.profilePhotoUrl").isString());
        SignupProfilePhoto photo = photos.findAll().get(0);
        assertThat(photo.userId).isEqualTo(users.findAll().get(0).userId);
        assertThat(photo.imageBytes).isNull(); assertThat(photo.storageProvider).isEqualTo("LOCAL");
        byte[] storedBytes = photoFiles.read(photo);
        BufferedImage stored = ImageIO.read(new ByteArrayInputStream(storedBytes));
        assertThat(stored.getWidth()).isEqualTo(512); assertThat(stored.getHeight()).isEqualTo(256);
        mvc.perform(get(photo.url())).andExpect(status().isOk()).andExpect(content().contentType("image/png"))
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
            .andExpect(content().bytes(storedBytes));
    }
    @Test void jpegPhotoIsConvertedAndInactiveOwnersPhotoIsNotServed() throws Exception {
        signup.signup(request(EMAIL, verifyEmail(EMAIL), "디오사용자"), photoPart("jpeg"));
        SignupProfilePhoto photo = photos.findAll().get(0);
        assertThat(ImageIO.read(new ByteArrayInputStream(photoFiles.read(photo)))).isNotNull();
        SignupUser owner = users.findAll().get(0); owner.deletedAt = Instant.now(); users.saveAndFlush(owner);
        mvc.perform(get(photo.url())).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/auth/profile-photos/" + java.util.UUID.randomUUID())).andExpect(status().isNotFound());
    }
    @Test void profilePhotoReadsExternalStorageAfterDatabaseTransactionEnds() throws Exception {
        signup.signup(request(EMAIL, verifyEmail(EMAIL), "디오사용자"), photoPart("png"));
        SignupProfilePhoto photo = photos.findAll().get(0);
        byte[] expected = photoFiles.read(photo);
        doAnswer(invocation -> {
            assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return invocation.callRealMethod();
        }).when(photoFiles).read(any());
        mvc.perform(get(photo.url())).andExpect(status().isOk()).andExpect(content().bytes(expected));
    }
    @Test void profilePhotoRejectsEnclosingTransactionAndInactiveOwnerWithoutStorageRead() throws Exception {
        signup.signup(request(EMAIL, verifyEmail(EMAIL), "디오사용자"), photoPart("png"));
        SignupProfilePhoto photo = photos.findAll().get(0);
        var transaction = new org.springframework.transaction.support.TransactionTemplate(transactionManager);
        clearInvocations(photoFiles);
        assertThatThrownBy(() -> transaction.execute(status -> signup.profilePhoto(photo.photoId)))
            .isInstanceOf(org.springframework.transaction.IllegalTransactionStateException.class);
        SignupUser owner = users.findAll().get(0); owner.status = "SUSPENDED"; users.saveAndFlush(owner);
        assertThatThrownBy(() -> signup.profilePhoto(photo.photoId)).isInstanceOf(SignupException.class);
        verify(photoFiles, never()).read(any());
    }
    @Test void invalidPhotoLeavesTokenUsableAndCreatesNoAccount() throws Exception {
        String token = verifyEmail(EMAIL);
        for (byte[] bytes : List.of(new byte[0], "<svg></svg>".getBytes(StandardCharsets.UTF_8))) {
            mvc.perform(multipart("/api/v1/auth/signup").file(signupPart(token))
                .file(new MockMultipartFile("photo", "fake.png", "image/png", bytes)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PROFILE_PHOTO"));
        }
        assertThat(users.count()).isZero(); assertThat(photos.count()).isZero();
        assertThat(verifications.findById(EMAIL).orElseThrow().consumedAt).isNull();
        mvc.perform(multipart("/api/v1/auth/signup").file(signupPart(token)))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.profilePhotoUrl").isEmpty());
    }
    @Test void photoStorageFailureRollsBackEntireSignup() throws Exception {
        String token = verifyEmail(EMAIL);
        long filesBefore;
        try (var files = java.nio.file.Files.walk(PHOTO_DIRECTORY)) { filesBefore = files.filter(java.nio.file.Files::isRegularFile).count(); }
        doThrow(new org.springframework.dao.DataIntegrityViolationException("photo persistence failure"))
            .when(photos).saveAndFlush(any(SignupProfilePhoto.class));
        assertThatThrownBy(() -> signup.signup(request(EMAIL, token, "디오사용자"), photoPart("png")))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(users.count()).isZero(); assertThat(providers.count()).isZero(); assertThat(agreements.count()).isZero();
        assertThat(photos.count()).isZero(); assertThat(verifications.findById(EMAIL).orElseThrow().consumedAt).isNull();
        try (var files = java.nio.file.Files.walk(PHOTO_DIRECTORY)) {
            assertThat(files.filter(java.nio.file.Files::isRegularFile).count()).isEqualTo(filesBefore);
        }
    }
    @Test void legacyDatabasePhotoRemainsReadableAndMigratesWithoutChangingUrl() throws Exception {
        signup.signup(request(EMAIL, verifyEmail(EMAIL), "디오사용자"));
        byte[] png = ProfilePhotoImages.prepare(photoPart("png"));
        SignupProfilePhoto legacy = photos.saveAndFlush(new SignupProfilePhoto(users.findAll().get(0).userId, png, Instant.now()));
        assertThat(photos.migrationPhotoIds("LOCAL", org.springframework.data.domain.PageRequest.of(0, 50))).contains(legacy.photoId);
        assertThat(photos.migrationPhotoIdsAfter("LOCAL", legacy.photoId, org.springframework.data.domain.PageRequest.of(0, 50))).isEmpty();
        mvc.perform(get(legacy.url())).andExpect(status().isOk()).andExpect(content().bytes(png));
        photoMigration.migrate(legacy.photoId);
        SignupProfilePhoto migrated = photos.findById(legacy.photoId).orElseThrow();
        assertThat(migrated.imageBytes).isNull(); assertThat(migrated.storageProvider).isEqualTo("LOCAL");
        assertThat(migrated.url()).isEqualTo(legacy.url());
        mvc.perform(get(migrated.url())).andExpect(status().isOk()).andExpect(content().bytes(png));
        photoMigration.migrate(migrated.photoId);
        assertThat(photos.count()).isEqualTo(1);
    }
    @Test void oversizedPhotoIsRejectedBeforeSaving() throws Exception {
        String token = verifyEmail(EMAIL);
        mvc.perform(multipart("/api/v1/auth/signup").file(signupPart(token))
            .file(new MockMultipartFile("photo", "large.png", "image/png", new byte[5 * 1024 * 1024 + 1])))
            .andExpect(status().isPayloadTooLarge());
        assertThat(users.count()).isZero(); assertThat(photos.count()).isZero();
    }
    @Test void swaggerExposesSignupOperationsAndPasswordIsWriteOnly() throws Exception {
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
            .andExpect(jsonPath("$.paths['/api/v1/auth/signup'].post").exists())
            .andExpect(jsonPath("$.paths['/api/v1/auth/email-availability'].post").exists())
            .andExpect(jsonPath("$.paths['/api/v1/auth/nickname-availability'].post").exists())
            .andExpect(jsonPath("$.paths['/api/v1/auth/email-verifications'].post").exists())
            .andExpect(jsonPath("$.paths['/api/v1/auth/email-verifications/verify'].post").exists())
            .andExpect(jsonPath("$.components.schemas.SignupRequest.properties.password.writeOnly").value(true))
            .andExpect(jsonPath("$.components.schemas.SignupRequest.properties.birthDate").doesNotExist())
            .andExpect(jsonPath("$.components.schemas.SignupResponse.properties.birthDate").doesNotExist())
            .andExpect(jsonPath("$.components.schemas.SignupRequest.properties.profileColor").doesNotExist())
            .andExpect(jsonPath("$.components.schemas.SignupResponse.properties.profileColor").doesNotExist())
            .andExpect(jsonPath("$.components.schemas.SignupResponse.properties.profilePhotoUrl").exists())
            .andExpect(jsonPath("$.paths['/api/v1/auth/signup'].post.requestBody.content['application/json']").exists())
            .andExpect(jsonPath("$.paths['/api/v1/auth/signup'].post.requestBody.content['multipart/form-data']").exists())
            .andExpect(jsonPath("$.paths['/api/v1/auth/profile-photos/{photoId}'].get").exists());
    }
}
