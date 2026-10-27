package com.f106.DIO.auth.service;

import com.f106.DIO.auth.dto.SignupRequest;
import com.f106.DIO.auth.dto.SignupResponse;

import com.f106.DIO.auth.domain.EmailAuthProvider;
import com.f106.DIO.auth.domain.EmailVerification;
import com.f106.DIO.auth.exception.SignupException;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import com.f106.DIO.auth.repository.EmailVerificationRepository;
import com.f106.DIO.auth.support.SignupSecrets;
import com.f106.DIO.user.service.UserPhotoService;
import com.f106.DIO.user.service.UserService;
import com.f106.DIO.user.service.UserTermsService;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
@Service
public class EmailSignupService {
    private final UserService users;
    private final EmailAuthProviderRepository providers;
    private final UserTermsService terms;
    private final EmailVerificationRepository verifications;
    private final UserPhotoService photos;
    private final TransactionTemplate readTransaction;
    private final TransactionTemplate writeTransaction;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
    public EmailSignupService(UserService users, EmailAuthProviderRepository providers, UserTermsService terms,
            EmailVerificationRepository verifications, UserPhotoService photos, PlatformTransactionManager manager) {
        this.users = users; this.providers = providers; this.terms = terms; this.verifications = verifications; this.photos = photos;
        readTransaction = new TransactionTemplate(manager); readTransaction.setReadOnly(true);
        writeTransaction = new TransactionTemplate(manager);
    }
    @Transactional(propagation = Propagation.NEVER)
    public SignupResponse signup(SignupRequest request) { return signup(request, null); }
    @Transactional(propagation = Propagation.NEVER)
    public SignupResponse signup(SignupRequest request, MultipartFile photo) {
        terms.validate(request.agreements());
        readTransaction.executeWithoutResult(status -> {
            users.assertAvailable(request.email(), request.nickname());
            validateToken(verifications.findById(request.email()).orElseThrow(this::invalidToken), request, Instant.now());
        });
        byte[] bytes = photos.prepareImage(photo);
        String hash = passwords.encode(request.password());
        try (var pending = photos.upload(bytes)) {
            return writeTransaction.execute(status -> {
                if (pending != null) pending.enlist();
                users.assertAvailable(request.email(), request.nickname());
                var verification = verifications.findForUpdate(request.email()).orElseThrow(this::invalidToken);
                Instant now = Instant.now(); validateToken(verification, request, now);
                var user = users.create(request.email(), request.nickname(), now);
                providers.saveAndFlush(new EmailAuthProvider(user.getUserId(), user.getEmail(), hash, now));
                terms.save(user.getUserId(), request.agreements(), now);
                String url = pending == null ? null : pending.save(user.getUserId(), now);
                verification.consume(now);
                return new SignupResponse(user.getUserId().toString(), user.getEmail(), user.getNickname(), url, user.getCreatedAt());
            });
        }
    }
    private void validateToken(EmailVerification row, SignupRequest request, Instant now) {
        if (row.getConsumedAt() != null || row.getTokenExpiresAt() == null || !now.isBefore(row.getTokenExpiresAt())
            || !SignupSecrets.matches(row.getTokenHash(), SignupSecrets.tokenHash(request.signupToken()))) throw invalidToken();
    }
    private SignupException invalidToken() { return SignupException.invalid("INVALID_SIGNUP_TOKEN", "이메일 인증을 다시 진행해 주세요."); }
}
