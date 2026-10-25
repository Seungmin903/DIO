package com.f106.DIO.auth.signup;

import java.time.Instant;
import java.util.EnumMap;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
    public EmailSignupService(SignupUserRepository users, EmailAuthProviderRepository providers,
            TermsAgreementRepository terms, EmailVerificationRepository verifications, SignupProperties properties,
            SignupProfilePhotoRepository photos, ProfilePhotoFiles photoFiles) {
        this.users = users; this.providers = providers; this.terms = terms;
        this.verifications = verifications; this.properties = properties;
        this.photos = photos;
        this.photoFiles = photoFiles;
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
    @Transactional(readOnly = true)
    public byte[] profilePhoto(UUID photoId) {
        SignupProfilePhoto photo = photos.findById(photoId).orElseThrow(() -> photoNotFound());
        SignupUser owner = users.findById(photo.userId).orElseThrow(() -> photoNotFound());
        if (owner.deletedAt != null || !"ACTIVE".equals(owner.status)) throw photoNotFound();
        return photoFiles.read(photo);
    }
    private SignupException photoNotFound() {
        return new SignupException(HttpStatus.NOT_FOUND, "PROFILE_PHOTO_NOT_FOUND", "프로필 사진을 찾을 수 없어요.");
    }
    @Transactional
    public SignupDtos.SignupResponse signup(SignupDtos.SignupRequest request) {
        return signup(request, null);
    }
    @Transactional
    public SignupDtos.SignupResponse signup(SignupDtos.SignupRequest request, MultipartFile photo) {
        validateTerms(request);
        if (users.existsByEmail(request.email())) throw SignupException.conflict("EMAIL_ALREADY_REGISTERED", "이미 가입된 이메일이에요.");
        if (!isNicknameAvailable(request.nickname())) {
            throw SignupException.conflict("NICKNAME_UNAVAILABLE", "사용할 수 없는 닉네임이에요.");
        }
        EmailVerification verification = verifications.findForUpdate(request.email()).orElseThrow(() -> invalidToken());
        Instant now = Instant.now();
        if (verification.consumedAt != null || verification.tokenExpiresAt == null
                || !now.isBefore(verification.tokenExpiresAt)
                || !SignupSecrets.matches(verification.tokenHash, SignupSecrets.tokenHash(request.signupToken()))) throw invalidToken();
        byte[] photoBytes = ProfilePhotoImages.prepare(photo);
        SignupUser user = users.saveAndFlush(new SignupUser(request, now));
        providers.saveAndFlush(new EmailAuthProvider(user.userId, user.email, passwords.encode(request.password()), now));
        terms.saveAllAndFlush(request.agreements().stream().map(a -> new TermsAgreement(user.userId, a, now)).toList());
        String photoUrl = null;
        if (photoBytes != null) {
            UUID photoId = UUID.randomUUID();
            var location = photoFiles.store(photoId, photoBytes);
            photoUrl = photos.saveAndFlush(new SignupProfilePhoto(photoId, user.userId, location, now)).url();
        }
        verification.consumedAt = now;
        return user.response(photoUrl);
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
