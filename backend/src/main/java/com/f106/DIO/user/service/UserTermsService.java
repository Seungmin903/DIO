package com.f106.DIO.user.service;

import com.f106.DIO.user.config.TermsProperties;
import com.f106.DIO.user.domain.TermsAgreement;
import com.f106.DIO.user.domain.TermsType;
import com.f106.DIO.user.dto.Agreement;
import com.f106.DIO.user.exception.UserException;
import com.f106.DIO.user.repository.TermsAgreementRepository;
import java.time.Instant;
import java.util.EnumMap;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static com.f106.DIO.user.domain.TermsType.*;
@Service
public class UserTermsService {
    private final TermsAgreementRepository terms;
    private final TermsProperties properties;
    public UserTermsService(TermsAgreementRepository terms, TermsProperties properties) { this.terms = terms; this.properties = properties; }
    @Transactional(propagation = Propagation.MANDATORY)
    public void save(Long userId, java.util.List<Agreement> agreements, Instant now) {
        terms.saveAllAndFlush(agreements.stream().map(a -> new TermsAgreement(userId, a.termsType().name(), a.termsVersion(), a.agreed(), now)).toList());
    }
    public void validate(java.util.List<Agreement> agreements) {
        var agreed = new EnumMap<TermsType, Boolean>(TermsType.class);
        for (var agreement : agreements) {
            String expected = switch (agreement.termsType()) {
                case SERVICE -> properties.serviceTermsVersion();
                case PRIVACY -> properties.privacyTermsVersion();
                case MARKETING -> properties.marketingTermsVersion();
            };
            if (agreed.put(agreement.termsType(), agreement.agreed()) != null || !expected.equals(agreement.termsVersion())) {
                throw UserException.invalid("INVALID_TERMS", "약관 종류와 현재 버전을 확인해 주세요.");
            }
        }
        if (!Boolean.TRUE.equals(agreed.get(SERVICE)) || !Boolean.TRUE.equals(agreed.get(PRIVACY))) {
            throw UserException.invalid("REQUIRED_TERMS_NOT_AGREED", "필수 약관에 동의해 주세요.");
        }
    }
}
