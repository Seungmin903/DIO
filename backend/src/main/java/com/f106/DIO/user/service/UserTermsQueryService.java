package com.f106.DIO.user.service;

import java.util.List;
import com.f106.DIO.user.config.TermsProperties;
import com.f106.DIO.user.domain.TermsRecordStatus;
import com.f106.DIO.user.domain.TermsType;
import com.f106.DIO.user.dto.TermsStatusItem;
import com.f106.DIO.user.dto.TermsStatusResponse;
import com.f106.DIO.user.exception.UserException;
import com.f106.DIO.user.repository.TermsAgreementRepository;
import com.f106.DIO.user.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserTermsQueryService {
    private static final List<TermsType> TYPES = List.of(TermsType.MARKETING_PRIVACY,
        TermsType.AD_EMAIL, TermsType.AD_PUSH, TermsType.AD_NIGHT_PUSH);
    private final UserRepository users;
    private final TermsAgreementRepository terms;
    private final TermsProperties versions;

    public UserTermsQueryService(UserRepository users, TermsAgreementRepository terms, TermsProperties versions) {
        this.users = users;
        this.terms = terms;
        this.versions = versions;
    }

    @Transactional(readOnly = true)
    public TermsStatusResponse current(long actor) {
        users.findById(actor).filter(user -> user.isActive()).orElseThrow(() ->
            new UserException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "다시 로그인해 주세요."));
        var entries = terms.findByUserIdAndTermsTypeIn(actor, TYPES.stream().map(Enum::name).toList());
        // These four types use the same current version as signup and the existing PUT endpoint.
        String currentVersion = versions.marketingTermsVersion();
        return new TermsStatusResponse(TYPES.stream().map(type -> {
            var history = entries.stream().filter(entry -> entry.getTermsType().equals(type.name())).toList();
            var current = history.stream().filter(entry -> entry.getTermsVersion().equals(currentVersion)).findFirst();
            return current.map(entry -> new TermsStatusItem(type, currentVersion, entry.isAgreed(),
                entry.getAgreedAt(), TermsRecordStatus.CURRENT_VERSION)).orElseGet(() ->
                new TermsStatusItem(type, currentVersion, false, null, history.isEmpty()
                    ? TermsRecordStatus.NOT_RECORDED : TermsRecordStatus.PREVIOUS_VERSION_ONLY));
        }).toList());
    }
}
