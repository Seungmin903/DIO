package com.f106.DIO.font;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import com.f106.DIO.user.domain.TermsAgreement;
import com.f106.DIO.user.exception.UserException;
import com.f106.DIO.user.repository.TermsAgreementRepository;
import com.f106.DIO.user.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 공유 다이어리에 내 손글씨 폰트를 올려 공유해도 되는지(계정 단위 동의).
 * 새 표를 만들지 않고 동의 기록 표(user_terms_agreements)에 terms_type = FONT_SHARE 행 하나로 둔다.
 * TermsType 열거형에는 넣지 않아 회원가입 · /api/v1/me/terms 의 약관 목록과 입력 검증은 그대로다.
 * 탈퇴하면 동의 기록 표 정리(UserWithdrawalDataRepository)와 함께 지워진다.
 */
@Service
public class FontShareConsentService {
    static final String TYPE = "FONT_SHARE";
    static final String VERSION = "v1";

    public enum Status { GRANTED, DENIED, NOT_ASKED }
    public record Consent(Status status, Instant changedAt) {}

    private final UserRepository users;
    private final TermsAgreementRepository terms;

    public FontShareConsentService(UserRepository users, TermsAgreementRepository terms) {
        this.users = users;
        this.terms = terms;
    }

    @Transactional(readOnly = true)
    public Consent get(long actor) {
        users.findById(actor).filter(user -> user.isActive()).orElseThrow(FontShareConsentService::relogin);
        return terms.findById(key(actor)).map(FontShareConsentService::of).orElse(new Consent(Status.NOT_ASKED, null));
    }

    /**
     * 동의 값을 저장한다. onlyIfNotAsked 면 아직 답이 없을 때만 저장하고, 이미 있으면 그 값을 그대로 돌려준다
     * (기기에만 있던 예전 답을 옮길 때 다른 기기에서 먼저 고른 답을 덮지 않게).
     */
    @Transactional
    public Consent set(long actor, boolean agreed, boolean onlyIfNotAsked) {
        // 같은 계정의 동시 요청(두 기기가 함께 옮기기 등)과 탈퇴를 회원 행 잠금으로 줄 세운다
        users.findForUpdate(actor).filter(user -> user.isActive()).orElseThrow(FontShareConsentService::relogin);
        var entry = terms.findById(key(actor)).orElse(null);
        if (entry != null && onlyIfNotAsked) return of(entry);
        var now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        if (entry == null) entry = new TermsAgreement(actor, TYPE, VERSION, agreed, now);
        else entry.changeAgreement(agreed, now);
        return of(terms.saveAndFlush(entry));
    }

    private static TermsAgreement.Key key(long actor) {
        var key = new TermsAgreement.Key();
        key.userId = actor; key.termsType = TYPE; key.termsVersion = VERSION;
        return key;
    }

    private static Consent of(TermsAgreement entry) {
        return new Consent(entry.isAgreed() ? Status.GRANTED : Status.DENIED, entry.getAgreedAt());
    }

    private static UserException relogin() {
        return new UserException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "다시 로그인해 주세요.");
    }
}
