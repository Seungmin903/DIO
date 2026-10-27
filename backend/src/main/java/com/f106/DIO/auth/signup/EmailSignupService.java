package com.f106.DIO.auth.signup;

import java.time.Instant;
import java.util.EnumMap;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import static com.f106.DIO.auth.signup.SignupDtos.TermsType.*;

@Service
public class EmailSignupService {
    private final SignupUserRepository users;
    private final EmailAuthProviderRepository providers;
    private final TermsAgreementRepository terms;
    private final EmailVerificationRepository verifications;
    private final SignupProperties properties;
    private final SignupProfilePhotoRepository photos;
    private final ProfilePhotoFiles photoFiles;
    private final TransactionTemplate readTransaction;
    private final TransactionTemplate writeTransaction;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
    public EmailSignupService(SignupUserRepository users, EmailAuthProviderRepository providers,
            TermsAgreementRepository terms, EmailVerificationRepository verifications, SignupProperties properties,
            SignupProfilePhotoRepository photos, ProfilePhotoFiles photoFiles, PlatformTransactionManager transactionManager) {
        this.users = users; this.providers = providers; this.terms = terms;
        this.verifications = verifications; this.properties = properties;
        this.photos = photos;
        this.photoFiles = photoFiles;
        readTransaction = new TransactionTemplate(transactionManager); readTransaction.setReadOnly(true);
        writeTransaction = new TransactionTemplate(transactionManager);
    }
    @Transactional(readOnly = true)
    public SignupDtos.AvailabilityResponse available(String email) {
        return new SignupDtos.AvailabilityResponse(!users.existsByEmail(email));
    }
    @Transactional(readOnly = true)
    public SignupDtos.AvailabilityResponse nicknameAvailable(String nickname) {
        return new SignupDtos.AvailabilityResponse(isNicknameAvailable(SignupDtos.nickname(nickname)));
    }
    private boolean isNicknameAvailable(String nickname) {
        String nicknameKey = nickname.toLowerCase(Locale.ROOT);
        return !nicknameKey.equals("관리자") && !nicknameKey.equals("dio") && !users.existsByNicknameKey(nicknameKey);
    }
    @Transactional(propagation = Propagation.NEVER)
    public byte[] profilePhoto(UUID photoId) {
        SignupProfilePhoto photo = readTransaction.execute(status -> {
            SignupProfilePhoto found = photos.findById(photoId).orElseThrow(this::photoNotFound);
            SignupUser owner = users.findById(found.userId).orElseThrow(this::photoNotFound);
            if (!owner.isActive()) throw photoNotFound();
            return found;
        });
        // 바이트 배열과 저장소 위치는 조회 시 로드되므로 외부 읽기는 커넥션 반환 후 실행한다.
        return photoFiles.read(photo);
    }
    private SignupException photoNotFound() {
        return new SignupException(HttpStatus.NOT_FOUND, "PROFILE_PHOTO_NOT_FOUND", "프로필 사진을 찾을 수 없어요.");
    }
    @Transactional(propagation = Propagation.NEVER)
    public SignupDtos.SignupResponse signup(SignupDtos.SignupRequest request) {
        return signup(request, null);
    }
    @Transactional(propagation = Propagation.NEVER)
    public SignupDtos.SignupResponse signup(SignupDtos.SignupRequest request, MultipartFile photo) {
        validateTerms(request);
        // 유효한 토큰을 먼저 확인한 뒤 고부하 처리를 시작하고, 저장 시 잠가 다시 검증한다.
        readTransaction.executeWithoutResult(status -> {
            checkAvailability(request);
            validateToken(verifications.findById(request.email()).orElseThrow(this::invalidToken), request, Instant.now());
        });
        byte[] photoBytes = ProfilePhotoImages.prepare(photo);
        String passwordHash = passwords.encode(request.password());
        UUID photoId = UUID.randomUUID();
        try (var pending = photoBytes == null ? null : photoFiles.upload(photoId, photoBytes)) {
            return writeTransaction.execute(status -> {
                if (pending != null) pending.enlist();
                checkAvailability(request);
                EmailVerification verification = verifications.findForUpdate(request.email()).orElseThrow(this::invalidToken);
                Instant now = Instant.now();
                validateToken(verification, request, now);
                SignupUser user = users.saveAndFlush(new SignupUser(request, now));
                providers.saveAndFlush(new EmailAuthProvider(user.userId, user.email, passwordHash, now));
                terms.saveAllAndFlush(request.agreements().stream().map(a -> new TermsAgreement(user.userId, a, now)).toList());
                String photoUrl = pending == null ? null : photos.saveAndFlush(
                    new SignupProfilePhoto(photoId, user.userId, pending.location, now)).url();
                verification.consumedAt = now;
                return user.response(photoUrl);
            });
        }
    }
    private void checkAvailability(SignupDtos.SignupRequest request) {
        if (users.existsByEmail(request.email())) throw SignupException.conflict("EMAIL_ALREADY_REGISTERED", "이미 가입된 이메일이에요.");
        if (!isNicknameAvailable(request.nickname())) {
            throw SignupException.conflict("NICKNAME_UNAVAILABLE", "사용할 수 없는 닉네임이에요.");
        }
    }
    private void validateToken(EmailVerification verification, SignupDtos.SignupRequest request, Instant now) {
        if (verification.consumedAt != null || verification.tokenExpiresAt == null
                || !now.isBefore(verification.tokenExpiresAt)
                || !SignupSecrets.matches(verification.tokenHash, SignupSecrets.tokenHash(request.signupToken()))) throw invalidToken();
    }
    private SignupException invalidToken() { return SignupException.invalid("INVALID_SIGNUP_TOKEN", "이메일 인증을 다시 진행해 주세요."); }
    private void validateTerms(SignupDtos.SignupRequest request) {
        var agreed = new EnumMap<SignupDtos.TermsType, Boolean>(SignupDtos.TermsType.class);
        for (var agreement : request.agreements()) {
            String expected = switch (agreement.termsType()) {
                case SERVICE -> properties.serviceTermsVersion();
                case PRIVACY -> properties.privacyTermsVersion();
                case MARKETING -> properties.marketingTermsVersion();
            };
            if (agreed.put(agreement.termsType(), agreement.agreed()) != null || !expected.equals(agreement.termsVersion())) {
                throw SignupException.invalid("INVALID_TERMS", "약관 종류와 현재 버전을 확인해 주세요.");
            }
        }
        if (!Boolean.TRUE.equals(agreed.get(SERVICE)) || !Boolean.TRUE.equals(agreed.get(PRIVACY))) {
            throw SignupException.invalid("REQUIRED_TERMS_NOT_AGREED", "필수 약관에 동의해 주세요.");
        }
    }
}
