package com.f106.DIO.user.service;

import java.time.Instant;
import com.f106.DIO.user.config.TermsProperties;
import com.f106.DIO.user.domain.TermsAgreement;
import com.f106.DIO.user.domain.TermsType;
import com.f106.DIO.user.dto.TermsUpdateResponse;
import com.f106.DIO.user.exception.UserException;
import com.f106.DIO.user.repository.TermsAgreementRepository;
import com.f106.DIO.user.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserTermsUpdateService {
    private final UserRepository users;
    private final TermsAgreementRepository terms;
    private final TermsProperties versions;
    public UserTermsUpdateService(UserRepository users,TermsAgreementRepository terms,TermsProperties versions){
        this.users=users;this.terms=terms;this.versions=versions;
    }
    @Transactional
    public TermsUpdateResponse update(long actor,TermsType type,String version,boolean agreed){
        String current=switch(type){
            case SERVICE -> versions.serviceTermsVersion();
            case PRIVACY -> versions.privacyTermsVersion();
            case MARKETING -> versions.marketingTermsVersion();
        };
        if(!current.equals(version))throw UserException.invalid("INVALID_TERMS","약관 종류와 현재 버전을 확인해 주세요.");
        if(type!=TermsType.MARKETING&&!agreed)
            throw UserException.invalid("REQUIRED_TERMS_NOT_AGREED","필수 약관 동의 철회는 회원 탈퇴 절차를 이용해 주세요.");
        // Serialize with signup/withdrawal and concurrent first agreement creation for this account.
        var user=users.findForUpdate(actor).filter(u->u.isActive()).orElseThrow(()->
            new UserException(HttpStatus.UNAUTHORIZED,"INVALID_TOKEN","다시 로그인해 주세요."));
        var key=new TermsAgreement.Key();key.userId=user.getUserId();key.termsType=type.name();key.termsVersion=version;
        var entry=terms.findById(key).orElse(null);
        var now=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        if(entry==null)entry=new TermsAgreement(actor,type.name(),version,agreed,now);
        else entry.changeAgreement(agreed,now);
        terms.saveAndFlush(entry);
        return new TermsUpdateResponse(type,version,entry.isAgreed(),entry.getAgreedAt());
    }
}
